"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, History, Plus, Send, Trash2, X } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import {
  NOVA_NAME,
  QUICK_ACTIONS,
  SUGGESTED_PROMPTS,
  WELCOME_MESSAGES,
  type AiPrompt,
  type AiPromptCategory
} from "@/lib/ai/clientContent";
import {
  consumeLocalMessage,
  deleteChat,
  getDraftChat,
  getLocalQuota,
  getSavedChats,
  saveChat,
  type AiLocalChat,
  type AiLocalMessage,
  type LocalQuota
} from "@/lib/ai/localChatStore";
import type { MessageKey } from "@/lib/i18n";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type ChatMessage = AiLocalMessage;

type AiChatAppProps = {
  active: boolean;
};

type PendingChatAction =
  | { type: "new" }
  | { type: "open"; chat: AiLocalChat };

const PROMPT_CATEGORIES: AiPromptCategory[] = ["mechanics", "route", "ai", "trust"];

export default function AiChatApp({ active }: AiChatAppProps) {
  const { locale, t, user } = useUserContext();
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
  const [pendingAction, setPendingAction] = useState<PendingChatAction | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const suggestions = SUGGESTED_PROMPTS[locale] ?? SUGGESTED_PROMPTS.en;
  const quickActions = QUICK_ACTIONS[locale] ?? QUICK_ACTIONS.en;
  const welcome = WELCOME_MESSAGES[locale] ?? WELCOME_MESSAGES.en;
  const novaName = NOVA_NAME[locale] ?? NOVA_NAME.en;
  const persistableMessages = useMemo(() => messages.filter((message) => message.content.trim()), [messages]);
  const quotaBlocked = Boolean(quota && (quota.dayRemaining <= 0 || quota.monthRemaining <= 0));
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

    if (!userId) {
      setMessages([]);
      setActiveChat(null);
      setSavedChats([]);
      setQuota(null);
      setIsRestoring(false);
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([getDraftChat(userId), getSavedChats(userId), getLocalQuota(userId)])
      .then(([draft, saved, nextQuota]) => {
        if (cancelled) return;
        setActiveChat(draft);
        setMessages(draft?.messages ?? []);
        setSavedChats(saved);
        setQuota(nextQuota);
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

      inFlightRef.current = true;
      setIsLoading(true);

      try {
        if (userId) {
          const nextQuota = await consumeLocalMessage(userId);
          setQuota(nextQuota);
          if (!nextQuota.consumed) return;
        }

        const userMsg: ChatMessage = { role: "user", content: trimmed };
        const aiMsg: ChatMessage = { role: "assistant", content: "" };
        const nextChat = activeChat ?? (userId ? createDraftChat(userId) : null);
        const allMsgs = [...messages.filter((message) => message.content.trim()), userMsg];

        if (nextChat) setActiveChat(nextChat);
        setMessages((prev) => [...prev, userMsg, aiMsg]);
        setInput("");

        abortRef.current = new AbortController();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMsgs.map((message) => ({ role: message.role, content: message.content })),
            locale
          }),
          signal: abortRef.current.signal
        });

        if (!res.ok) {
          const errorPayload = await res.json().catch(() => null) as { error?: string } | null;
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
    [activeChat, isLoading, isRestoring, locale, messages, recordAiChallengeProgress, t, userId]
  );

  const resetChat = useCallback(() => {
    setMessages([]);
    setInput("");
    setActiveChat(null);
    setQuestionsOpen(false);
    setHistoryOpen(false);
    setPendingAction(null);
  }, []);

  const completeOpenChat = useCallback((chat: AiLocalChat) => {
    setActiveChat(chat);
    setMessages(chat.messages);
    setInput("");
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

  return (
    <section className="ai-chat-screen">
      <header className="ai-chat-header">
        <div className="ai-chat-identity">
          <Image className="ai-chat-avatar" src="/icons/nova-avatar.svg" alt="" width={44} height={44} priority />
          <div>
            <span className="ai-chat-kicker">{t("ai.chat.novaLabel")}</span>
            <h2 className="ai-chat-welcome-title">{novaName}</h2>
          </div>
        </div>
        <div className="ai-chat-header-actions">
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
          <div className="ai-chat-welcome-icon">
            <Image src="/icons/nova-avatar.svg" alt="" width={72} height={72} priority />
          </div>
          <h1 className="ai-chat-empty-title">{t("ai.chat.title")}</h1>
          <p className="ai-chat-welcome-text">{welcome}</p>
          <div className="ai-chat-quick-actions" aria-label={t("ai.chat.quickActions")}>
            {quickActions.map((prompt) => (
              <button key={prompt.id} className="ai-suggestion-chip" type="button" onClick={() => void sendMessage(prompt.text)}>
                {prompt.text}
              </button>
            ))}
          </div>
          <p className="ai-chat-local-note">{t("ai.chat.localOnly")}</p>
        </div>
      ) : (
        <div className="ai-chat-messages">
          {messages.map((message, index) => (
            <div className={message.role === "user" ? "ai-msg-user" : "ai-msg-assistant"} key={`${message.role}-${index}`}>
              {message.role === "assistant" ? (
                <Image className="ai-msg-avatar" src="/icons/nova-avatar.svg" alt="" width={28} height={28} />
              ) : null}
              <div className="ai-msg-bubble">
                {message.content}
                {message.role === "assistant" && message.content === "" && isLoading ? <span className="ai-typing">...</span> : null}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {questionsOpen ? (
        <div className="ai-chat-question-panel">
          <div className="ai-chat-question-heading">
            <strong>{t("ai.chat.questions")}</strong>
            <button className="ai-chat-close-btn" type="button" onClick={() => setQuestionsOpen(false)} aria-label={t("app.common.close")}>
              <X size={16} />
            </button>
          </div>
          {groupedSuggestions.map(({ category, prompts }) => (
            <div className="ai-chat-question-group" key={category}>
              <span>{t(`ai.chat.category.${category}` as MessageKey)}</span>
              {prompts.map((prompt) => <PromptButton key={prompt.id} prompt={prompt} onSelect={sendMessage} />)}
            </div>
          ))}
        </div>
      ) : null}

      <div className="ai-chat-input-bar">
        <button
          className="ai-chat-icon-btn ai-chat-help-btn"
          type="button"
          onClick={() => setQuestionsOpen((open) => !open)}
          aria-label={questionsOpen ? t("ai.chat.questions.close") : t("ai.chat.questions.open")}
          aria-expanded={questionsOpen}
        >
          <CircleHelp size={19} />
        </button>
        <textarea
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
        {quotaText ? <span>{quotaText}</span> : null}
        {quotaBlocked ? <strong>{t("ai.chat.quotaLimited")}</strong> : null}
        {quota ? <small>{t("ai.chat.quotaReset")}</small> : null}
      </div>

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

function PromptButton({ prompt, onSelect }: { prompt: AiPrompt; onSelect: (text: string) => Promise<void> | void }) {
  return (
    <button className="ai-suggestion-chip" type="button" onClick={() => void onSelect(prompt.text)}>
      {prompt.text}
    </button>
  );
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
