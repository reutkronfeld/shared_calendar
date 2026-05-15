'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Send, Bot, User, CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api, type NegotiationSession } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function NegotiationPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  
  const [session, setSession] = useState<NegotiationSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Initial Data Fetch
  useEffect(() => {
    if (!sessionId) return;
    async function fetchData() {
      try {
        const [sessionData, meData] = await Promise.all([
          api.getNegotiationSession(sessionId),
          api.me(),
        ]);
        setSession(sessionData);
        setUserId(meData.user.id);

        // Set initial message once data is ready
        const blocker = sessionData.pendingMembers.find((m: any) => m.userId === meData.user.id);
        const welcome = blocker
          ? `היי! אני העוזר האישי שלך. הקבוצה שלך מנסה לקבוע את הפגישה "${sessionData.title}", אבל נראה שיש לך אירוע גמיש בשם "${blocker.summary}" שחוסם אותה. האם נוכל להזיז אותו?`
          : `היי! אני העוזר האישי שלך. אני עוזר לתאם את הפגישה "${sessionData.title}" מול שאר חברי הקבוצה.`;
        
        setMessages([{ id: 'welcome', role: 'assistant', content: welcome }]);
      } catch (err) {
        console.error('Fetch error:', err);
        toast.error('לא הצלחנו לטעון את פרטי השיחה.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [sessionId]);

  // 2. Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 3. Manual Stream Handling (Bypasses the broken AI SDK hook)
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/negotiate/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
        // @ts-ignore - Ensure credentials are sent
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Chat request failed');

      const assistantMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          // The backend uses Vercel AI SDK format (0: "text"\n)
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('0:')) {
              try {
                const text = JSON.parse(line.slice(2));
                assistantContent += text;
                setMessages(prev => 
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
                );
              } catch (e) { /* ignore parse errors for partial chunks */ }
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      toast.error('התקשורת עם הבוט נכשלה.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container py-10 text-center">
        <h1 className="text-2xl font-bold">השיחה לא נמצאה</h1>
        <p className="mt-2 text-muted-foreground">ייתכן שהקישור אינו תקין או שהשיחה הסתיימה.</p>
      </div>
    );
  }

  const meetingDate = format(new Date(session.slotStart), 'EEEE, d MMMM', { locale: he });
  const meetingTime = `${format(new Date(session.slotStart), 'HH:mm')}–${format(new Date(session.slotEnd), 'HH:mm')}`;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-primary">
              <CalendarDays className="size-5" />
              <CardTitle className="text-lg">תיאום פגישת קבוצה: {session.title}</CardTitle>
            </div>
            <CardDescription className="text-foreground/80">
              המועד המבוקש: {meetingDate} בשעות {meetingTime}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="flex h-[600px] flex-col overflow-hidden border-2 shadow-lg">
          <CardHeader className="border-b bg-muted/30 px-4 py-3">
            <CardTitle className="text-sm font-medium">צ׳אט פרטי עם עוזר התזמון</CardTitle>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden p-0">
            <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[85%] gap-3 rounded-lg px-4 py-2 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <div className="mt-1">
                        {m.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 rounded-lg bg-muted px-4 py-3">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>

          <div className="border-t p-4">
            <form onSubmit={sendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="כתוב הודעה..."
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
                autoComplete="off"
              />
              <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                <Send className="size-4" />
                <span className="sr-only">שלח</span>
              </Button>
            </form>
          </div>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">הצ׳אט הזה פרטי ודיסקרטי.</p>
      </div>
    </div>
  );
}
