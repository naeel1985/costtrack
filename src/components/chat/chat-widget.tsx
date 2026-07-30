"use client";

import * as React from "react";
import { MessageCircle, X, Send, Trash2, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/chat/markdown";
import { CHAT_STORAGE_KEY } from "@/lib/chat-storage";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "When is my next card payment due?",
  "What did I spend most on last month?",
  "Any payments due in the next 30 days?",
];

export function ChatWidget() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Load any saved conversation once.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) setMessages(parsed.filter((m) => m?.role && typeof m.content === "string"));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist as it changes (until "Forget" or logout clears it).
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, hydrated]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const history = [...messages, { role: "user" as const, content: trimmed }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const setLastAssistant = (content: string) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content };
        return copy;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "The assistant is unavailable.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLastAssistant(acc);
      }
      if (!acc.trim()) setLastAssistant("Sorry — I didn't catch that. Try again?");
    } catch (e) {
      // Drop the empty streaming bubble and surface the error.
      setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function forget() {
    setMessages([]);
    setError(null);
    setInput("");
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* Launcher balloon */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className={cn(
          "fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6",
          open && "scale-0 opacity-0",
        )}
      >
        <MessageCircle className="h-6 w-6" />
        {messages.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-positive" />
        )}
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-20 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-[720px] origin-bottom-right flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl transition-all md:bottom-6 md:right-6",
          "h-[min(82vh,760px)]",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
        )}
        role="dialog"
        aria-label="Assistant"
      >
        <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Assistant</div>
              <div className="text-[11px] text-muted-foreground">Private · ephemeral</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button variant="ghost" size="icon-sm" onClick={forget} aria-label="Forget conversation">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-3 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">
                Hi! Ask me anything about your money. I read your data through private tools — I never
                see your account names or who you pay.
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "max-w-[85%] rounded-br-sm bg-primary text-primary-foreground"
                      : "max-w-[95%] rounded-bl-sm bg-card shadow-sm",
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <Markdown text={m.content} />
                    ) : (
                      <span className="inline-flex gap-1 py-1">
                        <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                      </span>
                    )
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {error && <p className="border-t px-4 py-2 text-xs text-negative">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t bg-card px-3 py-3"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the assistant…"
            disabled={loading}
            aria-label="Message the assistant"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <p className="flex items-center justify-center gap-1.5 border-t bg-card px-3 py-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Nothing is saved server-side · names hidden from the AI
        </p>
      </div>
    </>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}
