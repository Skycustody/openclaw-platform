'use client';

import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react';
import { Loader2, Send, AlertTriangle, Bot, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  streaming?: boolean;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<{ messages: any[]; total: number }>('/agent/chat/history?limit=50')
      .then((data) => {
        if (cancelled) return;
        const loaded: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }));
        setMessages(loaded);
        setHistoryLoaded(true);
        setTimeout(() => scrollToBottom('instant'), 50);
      })
      .catch(() => setHistoryLoaded(true));
    return () => { cancelled = true; };
  }, [scrollToBottom]);

  const handleSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setError(null);
    setSending(true);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setTimeout(() => scrollToBottom(), 50);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await api.stream('/agent/chat', { message: text }, controller.signal);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'chunk') {
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.streaming) {
                  copy[copy.length - 1] = { ...last, content: last.content + evt.text };
                }
                return copy;
              });
              scrollToBottom();
            } else if (evt.type === 'error') {
              setError(evt.message);
            } else if (evt.type === 'done') {
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.streaming) {
                  copy[copy.length - 1] = { ...last, content: evt.fullText || last.content, streaming: false };
                }
                return copy;
              });
            }
          } catch {}
        }
      }

      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.streaming) {
          copy[copy.length - 1] = { ...last, streaming: false };
        }
        return copy;
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to send message');
      setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, scrollToBottom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  useEffect(() => {
    if (!sending) inputRef.current?.focus();
  }, [sending]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {!historyLoaded && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-white/20" />
          </div>
        )}

        {historyLoaded && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] mb-4">
              <Bot className="h-7 w-7 text-white/20" />
            </div>
            <p className="text-[15px] text-white/30 font-medium">Start a conversation</p>
            <p className="text-[12px] text-white/15 mt-1 max-w-xs">
              Type a message below to chat with your AI agent.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-[11px] text-red-400/60 hover:text-red-400">
            dismiss
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-white/[0.06] px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={sending}
              rows={1}
              className={cn(
                'w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5',
                'text-[14px] text-white placeholder:text-white/20',
                'focus:outline-none focus:border-white/20 focus:bg-white/[0.05]',
                'transition-all disabled:opacity-40',
                'max-h-[120px] scrollbar-thin scrollbar-thumb-white/10'
              )}
              style={{ minHeight: '42px' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className={cn(
              'flex h-[42px] w-[42px] items-center justify-center rounded-xl shrink-0',
              'border border-white/[0.08] transition-all',
              input.trim() && !sending
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white/[0.03] text-white/20 cursor-not-allowed'
            )}
          >
            {sending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3 py-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] mt-0.5">
          <Bot className="h-3.5 w-3.5 text-white/40" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed',
          isUser
            ? 'bg-white/[0.10] text-white rounded-br-md'
            : 'bg-white/[0.04] text-white/80 rounded-bl-md',
          message.streaming && !message.content && 'min-w-[60px]'
        )}
      >
        {message.streaming && !message.content ? (
          <div className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-pulse [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-pulse [animation-delay:0.4s]" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.streaming && (
              <span className="inline-block w-1.5 h-4 bg-white/40 ml-0.5 animate-pulse align-text-bottom" />
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.10] mt-0.5">
          <UserIcon className="h-3.5 w-3.5 text-white/50" />
        </div>
      )}
    </div>
  );
}
