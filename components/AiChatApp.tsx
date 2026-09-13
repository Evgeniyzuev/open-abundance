"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, History, Plus, Send, Settings2, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import {
  NOVA_NAME,
  SUGGESTED_PROMPTS,
  WELCOME_MESSAGES,
  type AiPrompt,
  type AiPromptCategory
} from "@/lib/ai/clientContent";
import {
  consumeLocalMessage,
  clearMemory,
  deleteChat,
  getDraftChat,
  getMemoryItems,
  getMemorySettings,
  getLocalQuota,
  getSavedChats,
  saveMemoryItem,
  setMemoryEnabled,
  deleteMemoryItem,
  saveChat,
  type AiLocalChat,
  type AiMemoryItem,
  type AiLocalMessage,
  type LocalQuota
} from "@/lib/ai/localChatStore";
import type { MessageKey } from "@/lib/i18n";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { getSoundsEnabled, playUiSound, setSoundsEnabled } from "@/lib/ui/sound";
import { readPrimaryWish } from "@/lib/wishJourney";

type ChatMessage = AiLocalMessage;

type AiChatAppProps = {
  active: boolean;
};

type PendingChatAction =
  | { type: "new" }
  | { type: "open"; chat: AiLocalChat };

const PROMPT_CATEGORIES: AiPromptCategory[] = ["mechanics", "route", "ai", "trust"];

type AiSettingsModel = {
  id: string;
  key: string;
  titleKey: string;
};

type AiChatSettings = {
  routeMode: "system" | "byok";
  modelId: string;
  connection: {
    maskedKey: string;
    status: "active" | "invalid" | "revoked";
  } | null;
  encryptionConfigured: boolean;
  models: AiSettingsModel[];
};

export default function AiChatApp({ active }: AiChatAppProps) {
  const { locale, profile, t, user } = useUserContext();
  const userId = user?.id ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChat, setActiveChat] = useState<AiLocalChat | null>(null);
  const [savedChats, setSavedChats] = useState<AiLocalChat[]>([]);
  const [quota, setQuota] = useState<LocalQuota | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSavingChat, setIsSavingChat] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiChatSettings | null>(null);
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingChatAction | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<AiPrompt[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [memoryItems, setMemoryItems] = useState<AiMemoryItem[]>([]);
  const [activeWishTitles, setActiveWishTitles] = useState<string[]>([]);
  const [memoryEnabled, setMemoryEnabledState] = useState(true);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCandidate, setMemoryCandidate] = useState<string | null>(null);
  const [soundsOn, setSoundsOn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const contextConsentRef = useRef(false);
  const contextDecisionRef = useRef(false);
  const skipContextRef = useRef(false);

  const suggestions = SUGGESTED_PROMPTS[locale] ?? SUGGESTED_PROMPTS.en;
  // Keep the compact starting set available for accessibility/analytics without
  // rendering prompt chips in the empty state. The Questions button owns them.
  const quickActions = suggestions;
  const welcome = WELCOME_MESSAGES[locale] ?? WELCOME_MESSAGES.en;
  const novaName = NOVA_NAME[locale] ?? NOVA_NAME.en;
  const nearestWish = readPrimaryWish(userId ?? undefined);
  const additionalWishTitles = activeWishTitles.filter((title) => title !== nearestWish?.title);
  const persistableMessages = useMemo(() => messages.filter((message) => message.content.trim()), [messages]);
  const isByok = aiSettings?.routeMode === "byok";
  const quotaBlocked = !isByok && Boolean(quota && (quota.dayRemaining <= 0 || quota.monthRemaining <= 0));
  const groupedSuggestions = useMemo(
    () => PROMPT_CATEGORIES.map((category) => ({
      category,
      prompts: suggestions.filter((prompt) => prompt.category === category)
    })),
    [suggestions]
  );

  useEffect(() => {
    if (active) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active, messages]);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    inFlightRef.current = false;
    setIsLoading(false);
    setIsRestoring(true);
    setActiveWishTitles([]);

    if (!userId) {
      setMessages([]);
      setActiveChat(null);
      setSavedChats([]);
      setQuota(null);
      setMemoryItems([]);
      setActiveWishTitles([]);
      setMemoryEnabledState(true);
      contextConsentRef.current = false;
      contextDecisionRef.current = false;
      setIsRestoring(false);
      return () => {
        cancelled = true;
      };
    }

    const consentKey = userId ? `oa-ai-context-consent:${userId}` : "";
    const storedContextDecision = consentKey ? window.localStorage.getItem(consentKey) : null;
    const hasContextConsent = storedContextDecision === "allowed";
    contextConsentRef.current = hasContextConsent;
    contextDecisionRef.current = Boolean(storedContextDecision);
    setSoundsOn(getSoundsEnabled());

    void loadAiWishContext(userId)
      .then((nextWishes) => { if (!cancelled) setActiveWishTitles(nextWishes); })
      .catch(() => { if (!cancelled) setActiveWishTitles([]); });

    void Promise.all([getDraftChat(userId), getSavedChats(userId), getLocalQuota(userId), getMemoryItems(userId), getMemorySettings(userId)])
      .then(([draft, saved, nextQuota, nextMemory, nextMemorySettings]) => {
        if (cancelled) return;
        setActiveChat(draft);
        setMessages(draft?.messages ?? []);
        setSavedChats(saved);
        setQuota(nextQuota);
        setMemoryItems(nextMemory);
        setMemoryEnabledState(nextMemorySettings.enabled);
      })
      .catch((error) => {
        if (!cancelled) console.warn("AI local chat restore failed.", error);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setAiSettings(null);
    setSettingsError(null);
    setOpenrouterKey("");
    setPrivacyAcknowledged(false);

    if (!userId) return () => {
      cancelled = true;
    };

    void loadAiSettings()
      .then((nextSettings) => {
        if (!cancelled && nextSettings) setAiSettings(nextSettings);
      })
      .catch((error) => {
        if (!cancelled) console.warn("AI settings restore failed.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || isRestoring || !activeChat || !persistableMessages.length) return;

    const timeoutId = window.setTimeout(() => {
      const nextChat: AiLocalChat = {
        ...activeChat,
        userId,
        title: getChatTitle(persistableMessages, locale),
        messages: persistableMessages,
        updatedAt: new Date().toISOString()
      };

      void saveChat(nextChat)
        .then(() => {
          if (nextChat.status === "saved") {
            setSavedChats((current) => upsertSavedChat(current, nextChat));
          }
        })
        .catch((error) => console.warn("AI local chat save failed.", error));
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [activeChat, isRestoring, locale, persistableMessages, userId]);

  const recordAiChallengeProgress = useCallback(async () => {
    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      await fetch("/api/challenges/progress", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ verificationLogic: "ai_message_sent" })
      });
    } catch (progressError) {
      console.warn("AI challenge progress was not recorded.", progressError);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || inFlightRef.current || isRestoring) return;
      if (contextDialogOpen && !contextDecisionRef.current && !skipContextRef.current) return;

      if (userId && !contextDecisionRef.current && !skipContextRef.current) {
        setPendingInput(trimmed);
        setContextDialogOpen(true);
        return;
      }

      inFlightRef.current = true;
      setIsLoading(true);
      setSuggestedPrompts([]);
      const includeContext = contextConsentRef.current && !skipContextRef.current;
      skipContextRef.current = false;

      try {
        if (userId && !isByok) {
          const nextQuota = await consumeLocalMessage(userId);
          setQuota(nextQuota);
          if (!nextQuota.consumed) return;
        }

        const userMsg: ChatMessage = { role: "user", content: trimmed };
        const aiMsg: ChatMessage = { role: "assistant", content: "" };
        const nextChat = activeChat ?? (userId ? createDraftChat(userId) : null);
        const allMsgs = [...messages.filter((message) => message.content.trim()), userMsg];
        const feedback = messages
          .map((message, index) => message.role === "assistant" && message.rating ? { index, rating: message.rating } : null)
          .filter((item): item is { index: number; rating: 1 | 2 | 3 | 4 | 5 } => Boolean(item));

        if (userId && memoryEnabled) {
          const explicit = extractExplicitMemory(trimmed);
          if (explicit) {
            const now = new Date().toISOString();
            const item: AiMemoryItem = { id: `explicit:${userId}:${crypto.randomUUID()}`, userId, ...explicit, createdAt: now, updatedAt: now };
            void saveMemoryItem(item).then(() => setMemoryItems((current) => [item, ...current].slice(0, 40)));
          }
          const feeling = detectFeelingCandidate(trimmed);
          if (feeling) setMemoryCandidate(feeling);
        }

        if (nextChat) setActiveChat(nextChat);
        setMessages((prev) => [...prev, userMsg, aiMsg]);
        setInput("");

        abortRef.current = new AbortController();
        const supabase = getBrowserSupabaseClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: allMsgs.map((message) => ({ role: message.role, content: message.content })),
            locale,
            feedback,
            context: includeContext ? buildAiContext(locale, profile, userId, memoryEnabled ? memoryItems : [], activeWishTitles) : undefined
          }),
          signal: abortRef.current.signal
        });

        if (!res.ok) {
          const errorPayload = await res.json().catch(() => null) as { error?: string; code?: string; quota?: LocalQuota } | null;
          if (errorPayload?.quota) setQuota(errorPayload.quota);
          if (errorPayload?.code === "ai_quota_exhausted") errorPayload.error = t("ai.chat.quotaLimited");
          if (errorPayload?.code === "ai_quota_unavailable") errorPayload.error = t("ai.chat.quotaUnavailable");
          if (errorPayload?.code === "ai_request_in_progress") errorPayload.error = t("ai.chat.requestInProgress");
          if (errorPayload?.code === "ai_rate_limited") errorPayload.error = t("ai.chat.rateLimited");
          if (errorPayload?.code === "ai_auth_required") errorPayload.error = t("ai.chat.authRequired");
          if (errorPayload?.code === "ai_providers_unavailable") errorPayload.error = t("ai.chat.providerUnavailable");
          if (errorPayload?.code === "ai_byok_not_configured") errorPayload.error = t("ai.chat.byokNotConfigured");
          if (errorPayload?.code === "ai_byok_invalid") errorPayload.error = t("ai.chat.byokInvalid");
          if (errorPayload?.code === "ai_byok_credits_exhausted") errorPayload.error = t("ai.chat.byokCredits");
          if (errorPayload?.code === "ai_byok_rate_limited") errorPayload.error = t("ai.chat.byokRateLimited");
          if (errorPayload?.code === "ai_byok_failed") errorPayload.error = t("ai.chat.byokFailed");
          if (errorPayload?.code === "ai_model_not_allowed") errorPayload.error = t("ai.chat.modelNotAllowed");
          setMessages((current) => replaceLastAssistant(current, `⚠️ ${errorPayload?.error ?? t("ai.chat.error")}`));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line) continue;
            acc += line;
            setMessages((current) => replaceLastAssistant(current, acc));
          }
        }

        if (acc.trim()) void recordAiChallengeProgress();
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessages((current) => replaceLastAssistant(current, `⚠️ ${t("ai.chat.error")}`));
      } finally {
        setIsLoading(false);
        inFlightRef.current = false;
        abortRef.current = null;
      }
    },
    [activeChat, activeWishTitles, contextDialogOpen, isByok, isLoading, isRestoring, locale, memoryEnabled, memoryItems, messages, profile, recordAiChallengeProgress, t, userId]
  );

  const updateAiSettings = useCallback(async (routeMode: "system" | "byok", modelId = aiSettings?.modelId) => {
    if (!modelId || (routeMode === "byok" && aiSettings?.connection?.status !== "active")) return;
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const accessToken = await getAiAccessToken();
      if (!accessToken) throw new Error("auth");
      const response = await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ routeMode, modelId })
      });
      if (!response.ok) throw new Error("settings");
      setAiSettings(await response.json() as AiChatSettings);
    } catch (error) {
      console.warn("AI settings update failed.", error);
      setSettingsError(t("ai.openrouter.settings.saveError"));
    } finally {
      setIsSavingSettings(false);
    }
  }, [aiSettings?.connection?.status, aiSettings?.modelId, t]);

  const connectOpenRouter = useCallback(async () => {
    const key = openrouterKey.trim();
    if (!key || !privacyAcknowledged) return;
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const accessToken = await getAiAccessToken();
      if (!accessToken) throw new Error("auth");
      const response = await fetch("/api/ai/openrouter/key", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, privacyAcknowledged })
      });
      if (!response.ok) throw new Error("connection");
      setAiSettings(await response.json() as AiChatSettings);
      setOpenrouterKey("");
      setPrivacyAcknowledged(false);
    } catch (error) {
      console.warn("OpenRouter connection failed.", error);
      setSettingsError(t("ai.openrouter.settings.saveError"));
    } finally {
      setIsSavingSettings(false);
    }
  }, [openrouterKey, privacyAcknowledged, t]);

  const disconnectOpenRouter = useCallback(async () => {
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const accessToken = await getAiAccessToken();
      if (!accessToken) throw new Error("auth");
      const response = await fetch("/api/ai/openrouter/key", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error("connection");
      setAiSettings(await response.json() as AiChatSettings);
    } catch (error) {
      console.warn("OpenRouter disconnect failed.", error);
      setSettingsError(t("ai.openrouter.settings.saveError"));
    } finally {
      setIsSavingSettings(false);
    }
  }, [t]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setInput("");
    setSuggestedPrompts([]);
    setSuggestionsLoading(false);
    setActiveChat(null);
    setQuestionsOpen(false);
    setHistoryOpen(false);
    setPendingAction(null);
  }, []);

  const completeOpenChat = useCallback((chat: AiLocalChat) => {
    setActiveChat(chat);
    setMessages(chat.messages);
    setInput("");
    setSuggestedPrompts([]);
    setSuggestionsLoading(false);
    setQuestionsOpen(false);
    setHistoryOpen(false);
  }, []);

  const requestChatTransition = useCallback(async (action: PendingChatAction) => {
    if (isLoading) return;
    if (activeChat?.status === "draft" && persistableMessages.length) {
      setPendingAction(action);
      return;
    }

    if (userId && activeChat?.status === "saved" && persistableMessages.length) {
      const updatedChat: AiLocalChat = {
        ...activeChat,
        title: getChatTitle(persistableMessages, locale),
        messages: persistableMessages,
        updatedAt: new Date().toISOString()
      };
      try {
        await saveChat(updatedChat);
      } catch (error) {
        console.warn("AI local chat flush failed.", error);
        return;
      }
      setActiveChat(updatedChat);
      setSavedChats((current) => upsertSavedChat(current, updatedChat));
    }

    if (action.type === "new") resetChat();
    else completeOpenChat(action.chat);
  }, [activeChat, completeOpenChat, isLoading, locale, persistableMessages, resetChat, userId]);

  const resolvePendingAction = useCallback(async (saveDraft: boolean) => {
    if (!pendingAction) return;
    const action = pendingAction;
    setIsSavingChat(true);

    try {
      if (userId && activeChat && persistableMessages.length) {
        if (saveDraft) {
          const savedChat: AiLocalChat = {
            ...activeChat,
            status: "saved",
            title: getChatTitle(persistableMessages, locale),
            messages: persistableMessages,
            updatedAt: new Date().toISOString()
          };
          await saveChat(savedChat);
          setSavedChats((current) => upsertSavedChat(current, savedChat));
        } else {
          await deleteChat(activeChat.id, userId);
        }
      }

      setPendingAction(null);
      if (action.type === "new") resetChat();
      else completeOpenChat(action.chat);
    } catch (error) {
      console.warn("AI chat transition failed.", error);
    } finally {
      setIsSavingChat(false);
    }
  }, [activeChat, completeOpenChat, locale, pendingAction, persistableMessages, resetChat, userId]);

  const handleOpenSavedChat = useCallback((chat: AiLocalChat) => {
    requestChatTransition({ type: "open", chat });
  }, [requestChatTransition]);

  const handleDeleteSavedChat = useCallback(async (chat: AiLocalChat) => {
    if (!userId) return;
    await deleteChat(chat.id, userId);
    setSavedChats((current) => current.filter((item) => item.id !== chat.id));
    if (activeChat?.id === chat.id) resetChat();
  }, [activeChat?.id, resetChat, userId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const quotaText = quota
    ? t("ai.chat.quota", { day: quota.dayRemaining, month: quota.monthRemaining })
    : null;

  const selectPrompt = useCallback((text: string) => {
    setInput(text);
    setQuestionsOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const openQuestions = useCallback(() => {
    const nextOpen = !questionsOpen;
    setQuestionsOpen(nextOpen);
    if (!nextOpen || suggestionsLoading || suggestedPrompts.length > 0) return;

    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
    if (!lastAssistant) return;
    const previousUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    setSuggestionsLoading(true);
    void loadSuggestedPrompts(lastAssistant.content, previousUserMessage, locale)
      .then(setSuggestedPrompts)
      .finally(() => setSuggestionsLoading(false));
  }, [locale, messages, questionsOpen, suggestedPrompts.length, suggestionsLoading]);

  const rateMessage = useCallback(async (index: number, rating: 1 | 2 | 3 | 4 | 5) => {
    const nextRating = messages[index]?.rating === rating ? null : rating;
    setMessages((current) => current.map((message, messageIndex) => messageIndex === index ? { ...message, rating: nextRating } : message));
    if (!userId) return;
    const reactionId = `reaction:${userId}:${index}`;
    if (nextRating === null) {
      await deleteMemoryItem(reactionId, userId);
      setMemoryItems((current) => current.filter((memory) => memory.id !== reactionId));
      return;
    }
    if (!memoryEnabled) return;
    const now = new Date().toISOString();
    const item: AiMemoryItem = {
      id: reactionId,
      userId,
      kind: "reaction",
      content: locale === "ru" ? `Ответ Новы получил оценку ${nextRating}/5` : `Nova's answer received a ${nextRating}/5 rating`,
      sensitivity: "ordinary",
      confirmed: true,
      createdAt: now,
      updatedAt: now
    };
    await saveMemoryItem(item);
    setMemoryItems((current) => [item, ...current.filter((memory) => memory.id !== item.id)]);
  }, [locale, memoryEnabled, messages, userId]);

  const saveMemoryCandidate = useCallback(async () => {
    if (!userId || !memoryCandidate || !memoryEnabled) return;
    const now = new Date().toISOString();
    const item: AiMemoryItem = {
      id: `feeling:${userId}:${crypto.randomUUID()}`,
      userId,
      kind: "feeling",
      content: memoryCandidate,
      sensitivity: "sensitive",
      confirmed: true,
      createdAt: now,
      updatedAt: now
    };
    await saveMemoryItem(item);
    setMemoryItems((current) => [item, ...current.filter((memory) => memory.id !== item.id)]);
    setMemoryCandidate(null);
  }, [memoryCandidate, memoryEnabled, userId]);

  const toggleMemory = useCallback(async () => {
    if (!userId) return;
    const next = !memoryEnabled;
    await setMemoryEnabled(userId, next);
    setMemoryEnabledState(next);
    if (!next) setMemoryCandidate(null);
  }, [memoryEnabled, userId]);

  const clearAllMemory = useCallback(async () => {
    if (!userId || !window.confirm(t("ai.chat.memory.clearConfirm"))) return;
    await clearMemory(userId);
    setMemoryItems([]);
  }, [t, userId]);

  const allowContext = useCallback(() => {
    if (!userId) return;
    window.localStorage.setItem(`oa-ai-context-consent:${userId}`, "allowed");
    contextConsentRef.current = true;
    contextDecisionRef.current = true;
    setContextDialogOpen(false);
    const nextInput = pendingInput;
    setPendingInput(null);
    if (nextInput) window.setTimeout(() => void sendMessage(nextInput), 0);
  }, [pendingInput, sendMessage, userId]);

  const continueWithoutContext = useCallback(() => {
    if (userId) window.localStorage.setItem(`oa-ai-context-consent:${userId}`, "denied");
    contextConsentRef.current = false;
    contextDecisionRef.current = true;
    setContextDialogOpen(false);
    skipContextRef.current = true;
    const nextInput = pendingInput;
    setPendingInput(null);
    if (nextInput) window.setTimeout(() => void sendMessage(nextInput), 0);
  }, [pendingInput, sendMessage, userId]);

  const toggleSounds = useCallback(() => {
    const next = !soundsOn;
    setSoundsEnabled(next);
    setSoundsOn(next);
    if (next) playUiSound("action");
  }, [soundsOn]);

  return (
    <section className="ai-chat-screen">
      <header className="ai-chat-header">
        {messages.length > 0 ? (
          <div className="ai-chat-identity">
            <Image className="ai-chat-avatar" src="/icons/nova-avatar.svg" alt="" width={44} height={44} priority />
            <div>
              <span className="ai-chat-kicker">{t("ai.chat.novaLabel")}</span>
              <h2 className="ai-chat-welcome-title">{novaName}</h2>
            </div>
          </div>
        ) : <span />}
        <div className="ai-chat-header-actions">
          <button
            className="ai-chat-icon-btn"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label={settingsOpen ? t("ai.openrouter.settings.close") : t("ai.openrouter.settings.open")}
            aria-expanded={settingsOpen}
          >
            <Settings2 size={18} />
          </button>
          <button
            className="ai-chat-icon-btn"
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-label={t("ai.chat.history.open")}
            aria-expanded={historyOpen}
          >
            <History size={18} />
          </button>
          <button
            className="ai-chat-icon-btn"
            type="button"
            onClick={() => void requestChatTransition({ type: "new" })}
            disabled={isLoading || isRestoring}
            aria-label={t("ai.chat.new")}
          >
            <Plus size={19} />
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <aside className="ai-chat-settings" aria-label={t("ai.openrouter.settings.title")}>
          <div className="ai-chat-settings-heading">
            <div>
              <strong>{t("ai.openrouter.settings.title")}</strong>
              <small>{isByok ? t("ai.openrouter.settings.active") : t("ai.openrouter.settings.systemActive")}</small>
            </div>
            <button className="ai-chat-close-btn" type="button" onClick={() => setSettingsOpen(false)} aria-label={t("app.common.close")}>
              <X size={16} />
            </button>
          </div>

          <div className="ai-chat-settings-section ai-chat-preferences">
            <div className="ai-chat-preference-row">
              <div>
                <strong>{t("ai.chat.memory.title")}</strong>
                <small>{t("ai.chat.memory.description")}</small>
              </div>
              <button className="ai-chat-icon-btn" type="button" onClick={() => void toggleMemory()} aria-pressed={memoryEnabled} aria-label={t("ai.chat.memory.toggle")}>
                {memoryEnabled ? "✓" : "—"}
              </button>
            </div>
            <button className="text-button" type="button" onClick={() => setMemoryOpen((open) => !open)}>{t("ai.chat.memory.manage")}</button>
            {memoryOpen ? (
              <div className="ai-chat-memory-list">
                {memoryItems.length ? memoryItems.map((item) => (
                  <div className="ai-chat-memory-row" key={item.id}>
                    <span>{item.content}</span>
                    <button className="text-button" type="button" onClick={() => void deleteMemoryItem(item.id, item.userId).then(() => setMemoryItems((current) => current.filter((memory) => memory.id !== item.id)))} aria-label={t("ai.chat.memory.delete")}><Trash2 size={14} /></button>
                  </div>
                )) : <small>{t("ai.chat.memory.empty")}</small>}
                {memoryItems.length ? <button className="text-button" type="button" onClick={() => void clearAllMemory()}>{t("ai.chat.memory.clear")}</button> : null}
              </div>
            ) : null}
            <div className="ai-chat-preference-row">
              <div><strong>{t("ai.chat.sound.title")}</strong><small>{t("ai.chat.sound.description")}</small></div>
              <button className="ai-chat-icon-btn" type="button" onClick={toggleSounds} aria-pressed={soundsOn} aria-label={t("ai.chat.sound.toggle")}>{soundsOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
            </div>
          </div>

          <div className="ai-chat-mode-grid" aria-label={t("ai.openrouter.settings.mode")}>
            <button
              className={isByok ? "ai-chat-mode-card" : "ai-chat-mode-card is-active"}
              type="button"
              disabled={isSavingSettings}
              onClick={() => void updateAiSettings("system")}
            >
              <strong>{t("ai.openrouter.settings.system")}</strong>
              <span>{t("ai.openrouter.settings.systemDescription")}</span>
            </button>
            <button
              className={isByok ? "ai-chat-mode-card is-active" : "ai-chat-mode-card"}
              type="button"
              disabled={isSavingSettings || aiSettings?.connection?.status !== "active" || aiSettings.encryptionConfigured === false}
              onClick={() => void updateAiSettings("byok")}
            >
              <strong>{t("ai.openrouter.settings.byok")}</strong>
              <span>{t("ai.openrouter.settings.byokDescription")}</span>
            </button>
          </div>

          <div className="ai-chat-settings-section">
            <strong>{t("ai.openrouter.settings.connection")}</strong>
            {aiSettings?.connection?.status === "active" ? (
              <>
                <p className="ai-chat-connection-status">{t("ai.openrouter.settings.connected", { key: aiSettings.connection.maskedKey })}</p>
                <p className="ai-chat-settings-muted">{t("ai.openrouter.settings.activePrivacy")}</p>
                {aiSettings.encryptionConfigured === false ? <p className="ai-chat-settings-warning">{t("ai.openrouter.settings.noEncryption")}</p> : null}
                <label className="ai-chat-field">
                  <span>{t("ai.openrouter.settings.model")}</span>
                  <select
                    value={aiSettings.modelId}
                    disabled={isSavingSettings}
                    onChange={(event) => void updateAiSettings(aiSettings.routeMode, event.target.value)}
                  >
                    {aiSettings.models.map((model) => <option value={model.id} key={model.id}>{t(model.titleKey as MessageKey)}</option>)}
                  </select>
                </label>
                <button className="text-button ai-chat-disconnect" type="button" disabled={isSavingSettings} onClick={() => void disconnectOpenRouter()}>
                  {t("ai.openrouter.settings.disconnect")}
                </button>
              </>
            ) : (
              <>
                <p className="ai-chat-settings-muted">{t("ai.openrouter.settings.notConnected")}</p>
                <strong>{t("ai.openrouter.settings.instructionsTitle")}</strong>
                <ol className="ai-chat-instructions">
                  <li>{t("ai.openrouter.settings.step1")}</li>
                  <li>{t("ai.openrouter.settings.step2")}</li>
                  <li>{t("ai.openrouter.settings.step3")}</li>
                  <li>{t("ai.openrouter.settings.step4")}</li>
                </ol>
                <a className="ai-chat-openrouter-link" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
                  {t("ai.openrouter.settings.openDashboard")}
                </a>
                <label className="ai-chat-field">
                  <span>{t("ai.openrouter.settings.keyLabel")}</span>
                  <input
                    type="password"
                    value={openrouterKey}
                    onChange={(event) => setOpenrouterKey(event.target.value)}
                    placeholder={t("ai.openrouter.settings.keyPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isSavingSettings || aiSettings?.encryptionConfigured === false}
                  />
                </label>
                <label className="ai-chat-checkbox">
                  <input
                    type="checkbox"
                    checked={privacyAcknowledged}
                    onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
                    disabled={isSavingSettings || aiSettings?.encryptionConfigured === false}
                  />
                  <span>{t("ai.openrouter.settings.privacy")}</span>
                </label>
                <button
                  className="primary-button ai-chat-connect"
                  type="button"
                  disabled={isSavingSettings || !openrouterKey.trim() || !privacyAcknowledged || aiSettings?.encryptionConfigured === false}
                  onClick={() => void connectOpenRouter()}
                >
                  {t("ai.openrouter.settings.connect")}
                </button>
                {aiSettings?.encryptionConfigured === false ? <p className="ai-chat-settings-warning">{t("ai.openrouter.settings.noEncryption")}</p> : null}
              </>
            )}
            {settingsError ? <p className="ai-chat-settings-error" role="alert">{settingsError}</p> : null}
          </div>
        </aside>
      ) : null}

      {historyOpen ? (
        <aside className="ai-chat-history" aria-label={t("ai.chat.history")}>
          <div className="ai-chat-history-heading">
            <strong>{t("ai.chat.history")}</strong>
            <button className="ai-chat-close-btn" type="button" onClick={() => setHistoryOpen(false)} aria-label={t("app.common.close")}>
              <X size={16} />
            </button>
          </div>
          {savedChats.length ? savedChats.map((chat) => (
            <div className="ai-chat-history-row" key={chat.id}>
              <button type="button" onClick={() => handleOpenSavedChat(chat)} disabled={isLoading}>
                <span>{chat.title || t("ai.chat.new")}</span>
                <small>{formatChatDate(chat.updatedAt, locale)}</small>
              </button>
              <button
                className="ai-chat-history-delete"
                type="button"
                onClick={() => void handleDeleteSavedChat(chat)}
                aria-label={t("ai.chat.history.delete")}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )) : <p className="ai-chat-history-empty">{t("ai.chat.history.empty")}</p>}
        </aside>
      ) : null}

      {isRestoring ? (
        <div className="ai-chat-loading">{t("ai.chat.loading")}</div>
      ) : messages.length === 0 ? (
        <div className="ai-chat-empty">
          <div className="ai-chat-welcome-hero" data-starting-prompt-count={quickActions.slice(0, 3).length}>
            <Image src="/nova-fox-robot.png" alt="" width={640} height={760} priority />
          </div>
          <span className="ai-chat-kicker">{t("ai.chat.novaLabel")}</span>
          <h1 className="ai-chat-empty-title">{novaName}</h1>
          <p className="ai-chat-welcome-text">{nearestWish?.title ? t("ai.chat.proactiveNext", { wish: nearestWish.title }) : welcome}</p>
          <p className="ai-chat-local-note">{t("ai.chat.localOnly")}</p>
        </div>
      ) : (
        <div className="ai-chat-messages">
          {messages.map((message, index) => (
            <div className={message.role === "user" ? "ai-msg-user" : "ai-msg-assistant"} key={`${message.role}-${index}`}>
              {message.role === "assistant" ? (
                <Image className="ai-msg-avatar" src="/icons/nova-avatar.svg" alt="" width={28} height={28} />
              ) : null}
              <div className="ai-msg-content">
                <div className="ai-msg-bubble">
                  {message.content}
                  {message.role === "assistant" && message.content === "" && isLoading ? <span className="ai-typing">...</span> : null}
                </div>
                {message.role === "assistant" && message.content.trim() ? (
                  <div className="ai-msg-rating" aria-label={t("ai.chat.rating.label")}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button key={rating} type="button" disabled={isLoading} className={message.rating === rating ? "is-selected" : ""} onClick={() => void rateMessage(index, rating as 1 | 2 | 3 | 4 | 5)} aria-label={`${t("ai.chat.rating.option", { rating })}: ${t(`ai.chat.rating.${rating}` as MessageKey)}`} title={t(`ai.chat.rating.${rating}` as MessageKey)}>
                        {rating === 1 ? "😕" : rating === 2 ? "🙁" : rating === 3 ? "😐" : rating === 4 ? "🙂" : "🤩"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {memoryCandidate ? (
        <div className="ai-chat-memory-candidate" role="status">
          <span>{t("ai.chat.memory.candidate", { value: memoryCandidate })}</span>
          <button className="text-button" type="button" onClick={() => void saveMemoryCandidate()}>{t("ai.chat.memory.save")}</button>
          <button className="text-button" type="button" onClick={() => setMemoryCandidate(null)}>{t("app.common.close")}</button>
        </div>
      ) : null}

      {questionsOpen ? (
        <div className="ai-chat-question-panel">
          <div className="ai-chat-question-heading">
            <strong>{t("ai.chat.questions")}</strong>
            <button className="ai-chat-close-btn" type="button" onClick={() => setQuestionsOpen(false)} aria-label={t("app.common.close")}>
              <X size={16} />
            </button>
          </div>
          {suggestionsLoading ? <p className="ai-chat-settings-muted">...</p> : null}
          {suggestedPrompts.length ? (
            <div className="ai-chat-question-group ai-chat-generated-questions">
              <span>{t("ai.chat.followUps")}</span>
              {suggestedPrompts.map((prompt) => <PromptButton key={prompt.id} prompt={prompt} onSelect={selectPrompt} />)}
            </div>
          ) : null}
          {groupedSuggestions.map(({ category, prompts }) => (
            <div className="ai-chat-question-group" key={category}>
              <span>{t(`ai.chat.category.${category}` as MessageKey)}</span>
              {prompts.map((prompt) => <PromptButton key={prompt.id} prompt={prompt} onSelect={selectPrompt} />)}
            </div>
          ))}
        </div>
      ) : null}

      <div className="ai-chat-input-bar">
        <button
          className="ai-chat-icon-btn ai-chat-help-btn"
          type="button"
          onClick={openQuestions}
          aria-label={questionsOpen ? t("ai.chat.questions.close") : t("ai.chat.questions.open")}
          aria-expanded={questionsOpen}
        >
          <CircleHelp size={19} />
        </button>
        <textarea
          ref={inputRef}
          className="ai-chat-textarea"
          placeholder={t("ai.chat.placeholder")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading || isRestoring || quotaBlocked}
        />
        <button
          className="ai-send-btn"
          type="button"
          onClick={() => void sendMessage(input)}
          disabled={!input.trim() || isLoading || isRestoring || quotaBlocked}
          aria-label={t("ai.chat.send")}
        >
          <Send size={20} />
        </button>
      </div>

      <div className="ai-chat-status-row">
        {isByok ? <span>{t("ai.openrouter.settings.active")}</span> : null}
        {!isByok && quotaText ? <span>{quotaText}</span> : null}
        {!isByok && quotaBlocked ? <strong>{t("ai.chat.quotaLimited")}</strong> : null}
        {!isByok && quota ? <small>{t("ai.chat.quotaReset")}</small> : null}
      </div>

      {contextDialogOpen ? (
        <div className="ai-chat-modal-backdrop" role="presentation">
          <section className="ai-chat-modal" role="dialog" aria-modal="true" aria-labelledby="ai-chat-context-title">
            <h2 id="ai-chat-context-title">{t("ai.chat.context.title")}</h2>
            <p>{t("ai.chat.context.description")}</p>
            <ul className="ai-chat-context-list">
              <li>{t("ai.chat.context.profile", { value: profile?.display_name || profile?.username || t("profile.guest") })}</li>
              <li>{t("ai.chat.context.wish", { value: readPrimaryWish(user?.id)?.title || t("ai.chat.context.none") })}</li>
              <li>
                {t("ai.chat.context.activeWishes", { count: additionalWishTitles.length })}
                {additionalWishTitles.length ? (
                  <ul className="ai-chat-context-memory-details">
                    {additionalWishTitles.map((title) => <li key={title}>{title}</li>)}
                  </ul>
                ) : null}
              </li>
              <li>
                {t("ai.chat.context.memory", { count: memoryEnabled ? memoryItems.filter((item) => item.confirmed).length : 0 })}
                {memoryEnabled && memoryItems.some((item) => item.confirmed) ? (
                  <ul className="ai-chat-context-memory-details">
                    {memoryItems.filter((item) => item.confirmed).slice(0, 20).map((item) => <li key={item.id}>{item.content}</li>)}
                  </ul>
                ) : null}
              </li>
              <li>{t("ai.chat.context.language", { value: locale.toUpperCase() })}</li>
            </ul>
            <div className="ai-chat-modal-actions">
              <button className="primary-button" type="button" onClick={allowContext}>{t("ai.chat.context.allow")}</button>
              <button className="secondary-button" type="button" onClick={continueWithoutContext}>{t("ai.chat.context.continue")}</button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingAction ? (
        <div className="ai-chat-modal-backdrop" role="presentation">
          <section className="ai-chat-modal" role="dialog" aria-modal="true" aria-labelledby="ai-chat-save-title">
            <h2 id="ai-chat-save-title">{t("ai.chat.saveDraft.title")}</h2>
            <p>{t("ai.chat.saveDraft.description")}</p>
            <div className="ai-chat-modal-actions">
              <button className="primary-button" type="button" disabled={isSavingChat} onClick={() => void resolvePendingAction(true)}>
                {t("ai.chat.saveDraft.save")}
              </button>
              <button className="secondary-button" type="button" disabled={isSavingChat} onClick={() => void resolvePendingAction(false)}>
                {t("ai.chat.saveDraft.discard")}
              </button>
              <button className="text-button" type="button" disabled={isSavingChat} onClick={() => setPendingAction(null)}>
                {t("ai.chat.saveDraft.cancel")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PromptButton({ prompt, onSelect }: { prompt: AiPrompt; onSelect: (text: string) => void }) {
  return (
    <button className="ai-suggestion-chip" type="button" onClick={() => onSelect(prompt.text)}>
      {prompt.text}
    </button>
  );
}

async function getAiAccessToken(): Promise<string | null> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function loadAiSettings(): Promise<AiChatSettings | null> {
  const accessToken = await getAiAccessToken();
  if (!accessToken) return null;
  const response = await fetch("/api/ai/settings", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("AI settings unavailable");
  return await response.json() as AiChatSettings;
}

function createDraftChat(userId: string): AiLocalChat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId,
    status: "draft",
    title: "",
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

function getChatTitle(messages: ChatMessage[], locale: "ru" | "en"): string {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim().replace(/\s+/g, " ");
  return firstUserMessage?.slice(0, 72) || (locale === "ru" ? "Новый чат" : "New chat");
}

function replaceLastAssistant(messages: ChatMessage[], content: string): ChatMessage[] {
  const next = [...messages];
  const lastIndex = next.length - 1;
  if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
    next[lastIndex] = { role: "assistant", content };
  }
  return next;
}

function upsertSavedChat(chats: AiLocalChat[], chat: AiLocalChat): AiLocalChat[] {
  return [chat, ...chats.filter((item) => item.id !== chat.id)].slice(0, 50);
}

function formatChatDate(value: string, locale: "ru" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function loadAiWishContext(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const token = await getAiAccessToken();
  if (!token) return [];
  const response = await fetch("/api/wishes?status=active&includeRecommended=false", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { wishes?: unknown };
  if (!Array.isArray(payload.wishes)) return [];
  return payload.wishes
    .map((wish) => (wish && typeof wish === "object" && typeof (wish as { title?: unknown }).title === "string" ? (wish as { title: string }).title.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

function buildAiContext(locale: "ru" | "en", profile: ReturnType<typeof useUserContext>["profile"], userId: string | null, memoryItems: AiMemoryItem[], activeWishTitles: string[]): string {
  const wish = readPrimaryWish(userId ?? undefined);
  const profileName = profile?.display_name || profile?.username || "";
  const lines = [`language: ${locale}`, profileName ? `display name: ${profileName}` : ""];
  if (wish?.title) lines.push(`nearest wish: ${wish.title}`);
  for (const title of activeWishTitles.filter((item) => item && item !== wish?.title).slice(0, 10)) lines.push(`active wish: ${title}`);
  for (const item of memoryItems.filter((memory) => memory.confirmed).slice(0, 20)) lines.push(`${item.kind}: ${item.content}`);
  return lines.filter(Boolean).join("\n");
}

async function loadSuggestedPrompts(answer: string, previousUserMessage: string, locale: "ru" | "en"): Promise<AiPrompt[]> {
  const fallback = fallbackPrompts(answer, locale);
  try {
    const token = await getAiAccessToken();
    if (!token) return fallback;
    const response = await fetch("/api/ai/suggestions", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ answer, previousUserMessage, locale })
    });
    const payload = (await response.json()) as { suggestions?: unknown };
    if (!response.ok || !Array.isArray(payload.suggestions)) return fallback;
    const items = payload.suggestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5);
    return items.length >= 3 ? items.map((text, index) => ({ id: `generated-${index}-${text.slice(0, 12)}`, category: "route", text })) : fallback;
  } catch {
    return fallback;
  }
}

function fallbackPrompts(answer: string, locale: "ru" | "en"): AiPrompt[] {
  const lower = answer.toLowerCase();
  const ru = locale === "ru";
  const prompts = lower.includes(ru ? "желан" : "wish")
    ? (ru ? ["Помоги уточнить моё желание", "Какой первый шаг сделать сегодня?", "Как понять, что я продвинулся?"] : ["Help me clarify my wish", "What first step can I take today?", "How will I know I moved forward?"])
    : (ru ? ["Объясни это проще", "Как это применить сегодня?", "Какие есть варианты дальше?"] : ["Explain this more simply", "How can I use this today?", "What options do I have next?"]);
  return prompts.map((text, index) => ({ id: `fallback-${index}`, category: "route", text }));
}

function extractExplicitMemory(content: string): Pick<AiMemoryItem, "kind" | "content" | "sensitivity" | "confirmed"> | null {
  const patterns: Array<{ kind: AiMemoryItem["kind"]; expression: RegExp }> = [
    { kind: "interest", expression: /(?:я люблю|мне нравится|i like|i love)\s+(.+)/i },
    { kind: "goal", expression: /(?:моя цель|я хочу|my goal is|i want to)\s+(.+)/i },
    { kind: "preference", expression: /(?:я предпочитаю|мне важно|i prefer|it matters to me)\s+(.+)/i }
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern.expression);
    if (match?.[1]) return { kind: pattern.kind, content: match[1].trim().slice(0, 180), sensitivity: "ordinary", confirmed: true };
  }
  return null;
}

function detectFeelingCandidate(content: string): string | null {
  const match = content.match(/(?:меня радует|меня беспокоит|я переживаю из-за|makes me happy|i(?:'m| am) worried about)\s+(.+)/i);
  return match?.[0]?.trim().slice(0, 180) ?? null;
}
