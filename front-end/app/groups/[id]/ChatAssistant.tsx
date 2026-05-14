'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Sparkles, SendHorizonal, Square, User, Loader2, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  groupId: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_group_detail: 'קורא את פרטי הקבוצה',
  find_slots: 'מחפש זמנים פנויים',
  update_constraints: 'מעדכן אילוצים',
};

const TOOL_LABELS_DONE: Record<string, string> = {
  get_group_detail: 'פרטי הקבוצה',
  find_slots: 'זמנים פנויים',
  update_constraints: 'האילוצים עודכנו',
};

const SUGGESTED = [
  'מתי כולנו פנויים השבוע לשעה?',
  'מה האילוצים שלנו עכשיו?',
  'מי בקבוצה?',
  'שנה את שעת הסיום ל־19:00',
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ChatAssistant({ groupId }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/groups/${groupId}/chat`,
      credentials: 'include',
    }),
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      toast.error(`שגיאה בצ׳אט: ${msg}`);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  const lastMsg = messages[messages.length - 1];
  const lastIsAssistant = lastMsg?.role === 'assistant';
  const lastHasText = lastMsg?.parts?.some(
    (p) => p.type === 'text' && p.text?.trim(),
  );
  const lastHasActiveTool = lastMsg?.parts?.some(
    (p) =>
      typeof p.type === 'string' &&
      p.type.startsWith('tool-') &&
      (p as { state?: string }).state !== 'output-available' &&
      (p as { state?: string }).state !== 'result',
  );
  const showThinking =
    isLoading && hasMessages && lastIsAssistant && !lastHasText && !lastHasActiveTool;

  // Auto-scroll on new content if the user hasn't scrolled away.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, status]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickRef.current = distance <= 4;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleSend = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || isLoading) return;
      if (!override) {
        setInput('');
        if (inputRef.current) inputRef.current.style.height = 'auto';
      }
      stickRef.current = true;
      await sendMessage({ text });
    },
    [input, isLoading, sendMessage],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[60vh] min-h-[400px] flex-col gap-3 rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-medium">עוזר תזמון</span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3"
      >
        {!hasMessages && !isLoading ? (
          <div className="space-y-2 py-4">
            <p className="text-sm text-muted-foreground">
              שאלו אותי על זמנים, אילוצים או חברי הקבוצה.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-foreground transition hover:bg-muted"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const textParts =
                msg.parts?.filter(
                  (p): p is { type: 'text'; text: string } =>
                    p.type === 'text' && !!(p as { text?: string }).text?.trim(),
                ) ?? [];
              const toolParts =
                msg.parts?.filter(
                  (p) =>
                    typeof p.type === 'string' && p.type.startsWith('tool-'),
                ) ?? [];
              const combined = textParts.map((p) => p.text).join('');

              if (!combined && toolParts.length === 0) return null;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2 rounded-lg p-2',
                    isUser ? 'bg-primary/10' : 'bg-muted/40',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full',
                      isUser ? 'bg-primary' : 'bg-gradient-to-br from-purple-500 to-pink-500',
                    )}
                  >
                    {isUser ? (
                      <User className="size-3 text-primary-foreground" />
                    ) : (
                      <Sparkles className="size-3 text-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {combined && (
                      <div className="prose prose-sm max-w-none break-words text-sm leading-relaxed text-foreground prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                        {isUser ? (
                          <p className="m-0 whitespace-pre-wrap">{combined}</p>
                        ) : (
                          <ReactMarkdown>{combined}</ReactMarkdown>
                        )}
                      </div>
                    )}
                    {toolParts.map((part, i) => {
                      const p = part as {
                        type: string;
                        state?: string;
                        toolName?: string;
                      };
                      const toolName = p.toolName ?? p.type.replace(/^tool-/, '');
                      const done =
                        p.state === 'output-available' || p.state === 'result';
                      const label = done
                        ? TOOL_LABELS_DONE[toolName] ?? toolName
                        : TOOL_LABELS[toolName] ?? toolName;
                      return (
                        <div
                          key={i}
                          className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          {done ? (
                            <Wrench className="size-3 text-primary" />
                          ) : (
                            <Loader2 className="size-3 animate-spin text-primary" />
                          )}
                          <span>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {showThinking && (
              <div className="flex gap-2 rounded-lg bg-muted/40 p-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                  <Sparkles className="size-3 text-white" />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  חושב…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t p-2">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="שאלו אותי משהו…"
          rows={1}
          dir="rtl"
          className="max-h-[120px] min-h-[36px] flex-1 resize-none"
          onInput={(e) => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 120) + 'px';
          }}
        />
        {isLoading ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => stop()}
            aria-label="עצור"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            disabled={!input.trim()}
            onClick={() => handleSend()}
            aria-label="שלח"
          >
            <SendHorizonal className="size-4 rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}
