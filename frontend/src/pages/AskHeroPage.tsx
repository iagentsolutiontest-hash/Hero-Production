import { useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AskHeroPage() {
  const { session, activeOrg } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!session || !activeOrg || !input.trim() || sending) return;
    const prompt = input.trim();
    setMessages((m) => [...m, { role: 'user', content: prompt }]);
    setInput('');
    setSending(true);
    setError(null);
    try {
      const result = await api.ai.ask(session.accessToken, activeOrg.id, prompt);
      setMessages((m) => [...m, { role: 'assistant', content: result.reply }]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Ask Hero is not reachable right now.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl mb-1">Ask Hero</h1>
      <p className="text-sm text-ink/50 mb-6">
        A general accounting and bookkeeping assistant. It doesn't have direct access to your ledger — treat answers
        as guidance, not filed figures.
      </p>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden flex flex-col" style={{ height: 420 }}>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-ink/40">
              Ask something like "What's the difference between cash and accrual accounting?" or "How do I record a
              prepayment?"
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
              <div
                className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${
                  m.role === 'user' ? 'bg-ledger text-white' : 'bg-ink/5 text-ink'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && <div className="text-sm text-ink/40">Thinking…</div>}
        </div>
        {error && <p className="text-xs text-brick bg-brick-soft px-5 py-2">{error}</p>}
        <div className="border-t border-ink/10 p-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask a question…"
            className="flex-1 border border-ink/15 rounded-md px-3 py-2 text-sm"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="bg-ledger text-white text-sm rounded-md px-4 py-2 font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
