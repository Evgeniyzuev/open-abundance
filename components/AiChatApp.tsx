"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { SUGGESTED_PROMPTS, WELCOME_MESSAGES } from "@/lib/ai/clientContent";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiChatAppProps = {
  active: boolean;
};

export default function AiChatApp({ active }: AiChatAppProps) {
  const { locale, t } = useUserContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


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
      if (!trimmed || isLoading) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const aiMsg: ChatMessage = { role: "assistant", content: "" };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setInput("");
      setIsLoading(true);

      const allMsgs = [...messages, userMsg];

      try {
        abortRef.current = new AbortController();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMsgs.map((m) => ({ role: m.role, content: m.content })),
            locale,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setMessages((prev) => {
            const u = [...prev];
            u[u.length - 1] = {
              role: "assistant",
              content: "\u26a0\ufe0f " + (err?.error ?? "AI service error"),
            };
            return u;
          });
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
            if (line) {
              acc += line;
              setMessages((prev) => {
                const u = [...prev];
                u[u.length - 1] = { role: "assistant", content: acc };
                return u;
              });
            }
          }
        }

        if (acc.trim()) {
          void recordAiChallengeProgress();
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = {
            role: "assistant",
            content: "\u26a0\ufe0f Failed to get response. Try again.",
          };
          return u;
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, messages, locale, recordAiChallengeProgress]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const handleSuggestion = useCallback(
    (s: string) => {
      setInput(s);
      void sendMessage(s);
    },
    [sendMessage]
  );

  const handleClear = useCallback(() => {
    if (isLoading) abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  }, [isLoading]);

  const suggestions = SUGGESTED_PROMPTS[locale] ?? SUGGESTED_PROMPTS.en;
  const welcome = WELCOME_MESSAGES[locale] ?? WELCOME_MESSAGES.en;

  return (
    <section className="ai-chat-screen">
      {messages.length === 0 ? (
        <div className="ai-chat-empty">
          <div className="ai-chat-welcome-icon">
            <Sparkles size={40} />
          </div>
          <h2 className="ai-chat-welcome-title">
            {t("ai.chat.title")}
          </h2>
          <p className="ai-chat-welcome-text">{welcome}</p>
          <div className="ai-chat-suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                className="ai-suggestion-chip"
                type="button"
                onClick={() => handleSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="ai-chat-messages">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={msg.role === "user" ? "ai-msg-user" : "ai-msg-assistant"}
            >
              {msg.role === "assistant" && (
                <span className="ai-msg-avatar">
                  <Sparkles size={16} />
                </span>
              )}
              <div className="ai-msg-bubble">
                {msg.content}
                {msg.role === "assistant" && msg.content === "" && isLoading && (
                  <span className="ai-typing">...</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="ai-chat-input-bar">
        {messages.length > 0 && (
          <button
            className="ai-clear-btn"
            type="button"
            onClick={handleClear}
            aria-label="Clear chat"
          >
            <Trash2 size={18} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          className="ai-chat-textarea"
          placeholder={t("ai.chat.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
        />
        <button
          className="ai-send-btn"
          type="button"
          onClick={() => void sendMessage(input)}
          disabled={!input.trim() || isLoading}
          aria-label="Send"
        >
          <Send size={20} />
        </button>
      </div>
    </section>
  );
}
