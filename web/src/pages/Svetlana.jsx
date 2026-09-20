/**
 * Светлана — рабочий стол AI-оператора (§11–§14).
 *
 * Показывает эмоцию (из emotion engine), ход выполнения инструментов и
 * доказательства по каждому действию: VERIFIED / NOT PROVEN / FAILED.
 * Никаких поддельных успехов — статус берётся из ответа backend.
 */
import { useEffect, useRef, useState } from 'react';import { ai } from '../api.js';
import { useAuth } from '../auth.jsx';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';
import { fmtDate } from '../ui.jsx';

const EMOTION_CLASS = {
  THINKING: 'thinking', SUCCESS: 'success', HAPPY: 'success',
  WARNING: 'warning', CONCERNED: 'concerned',
};

const SUGGESTIONS = [
  'Создай клиента ООО Вектор',
  'Поставь задачу позвонить клиенту завтра',
  'Напомни завтра в 10:00 отправить акт',
  'Найди гранты для самозанятых',
  'Подготовь договор оказания услуг',
  'Какие налоги платит самозанятый на НПД?',
  'Найди подходящие проекты',
  'Покажи просроченные задачи',
];

function ActionEvidence({ action, onApprove, approving }) {
  const tone = action.status === 'succeeded' && action.verified ? 'ok'
    : action.status === 'succeeded' ? 'warn'
    : action.status === 'failed' ? 'err' : 'warn';
  const label = action.status === 'succeeded' && action.verified ? 'VERIFIED'
    : action.status === 'succeeded' ? 'NOT PROVEN'
    : action.status === 'failed' ? 'FAILED'
    : action.status === 'blocked' ? 'BLOCKED' : 'PENDING';
  return (
    <div className="action-pill">
      <span className={`badge ${tone}`}>{label}</span>
      <span className="badge">{action.tool}</span>
      {action.needs_approval && <span className="badge warn">требует подтверждения</span>}
      {action.needs_approval && action.id && (
        <button
          className="btn btn-sm btn-primary"
          onClick={() => onApprove(action)}
          disabled={approving === action.id}
        >
          {approving === action.id ? 'Выполняю…' : 'Подтвердить'}
        </button>
      )}
      {action.error && <span className="small muted">{action.error}</span>}
    </div>
  );
}

export default function SvetlanaPage() {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [emotion, setEmotion] = useState('IDLE');
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(null);
  const scroller = useRef(null);

  // Restore the most recent conversation on first open.
  useEffect(() => {
    (async () => {
      try {
        const list = await ai.conversations();
        const last = list?.data?.[0];
        if (last) {
          setConversationId(last.id);
          const full = await ai.conversation(last.id);
          setMessages(full.messages ?? []);
        }
      } catch { /* no conversations yet — fine */ }
    })();
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, busy]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setError(null);
    setInput('');
    setBusy(true);
    setEmotion('THINKING');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    try {
      const res = await ai.chat({ message, conversation_id: conversationId });
      if (!conversationId && res.conversation_id) setConversationId(res.conversation_id);
      setEmotion(res.emotion ?? 'IDLE');
      setMessages((m) => [...m, {
        role: 'assistant',
        content: res.content,
        emotion: res.emotion,
        actions: res.actions ?? [],
        provider: res.provider,
      }]);
    } catch (err) {
      setEmotion('WARNING');
      setError(err.message ?? 'Светлана сейчас недоступна');
      setMessages((m) => [...m, {
        role: 'assistant',
        content: 'Я не смогла обработать запрос. Это FAILED — повторите позже или используйте разделы напрямую.',
        emotion: 'WARNING',
        actions: [],
      }]);
    } finally {
      setBusy(false);
    }
  };

  const approve = async (action) => {
    setError(null);
    setApproving(action.id);
    try {
      const result = await ai.approveAction(action.id);
      setMessages((items) => items.map((m) => ({
        ...m,
        actions: (m.actions ?? []).map((a) => a.id === action.id ? { ...a, ...result } : a),
      })));
      setMessages((items) => [...items, {
        role: 'assistant',
        content: result.message || (result.verified ? 'Действие подтверждено и выполнено.' : 'Действие выполнено, но его нельзя подтвердить как VERIFIED.'),
        actions: [result],
      }]);
      setEmotion(result.status === 'succeeded' && result.verified ? 'SUCCESS' : result.status === 'failed' ? 'WARNING' : 'CONCERNED');
    } catch (err) {
      setError(err.message ?? 'Не удалось выполнить подтверждённое действие');
    } finally {
      setApproving(null);
    }
  };

  const ringClass = EMOTION_CLASS[emotion] ?? '';

  return (
    <div className="chat-layout">
      <div className="chat-window">
        <div className="chat-messages" ref={scroller} aria-live="polite">
          {messages.length === 0 && !busy && (
            <div className="empty">
              <div className="ico"><SvetlanaAvatar emotion="IDLE" size={72} /></div>
              <h3>Привет, я Светлана</h3>
              <p className="muted">
                Я ваш AI-оператор. Могу завести клиента, поставить задачу и напоминание,
                подготовить договор, найти гранты и ответить по налогам со ссылками на источники.
              </p>
              <div className="row" style={{ justifyContent: 'center' }}>
                {SUGGESTIONS.slice(0, 4).map((s) => (
                  <button key={s} className="btn btn-sm" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : ''}`}>
              {m.role === 'assistant' && (
                <div className="avatar-wrap">
                  <SvetlanaAvatar emotion={m.emotion ?? 'IDLE'} size={36} />
                </div>
              )}
              <div>
                <div className="who">{m.role === 'user' ? (user?.email ?? 'Вы') : 'Светлана'}</div>
                <div className="bubble">{m.content}</div>
                {m.actions?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {m.actions.map((a, j) => (
                      <ActionEvidence key={j} action={a} onApprove={approve} approving={approving} />
                    ))}
                  </div>
                )}
                {m.provider && m.provider !== 'local' && (
                  <div className="who">провайдер: {m.provider}</div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="msg">
              <div className="avatar-wrap">
                <SvetlanaAvatar emotion="THINKING" size={36} thinking />
              </div>
              <div className="bubble muted">Светлана думает…</div>
            </div>
          )}
        </div>

        {error && <div className="alert err" style={{ margin: '0 12px' }} role="alert">{error}</div>}

        <div className="chat-input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Напишите задачу — например: создай клиента ООО Вектор и подготовь договор"
            disabled={busy}
            aria-label="Сообщение Светлане"
          />
          <button className="btn btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>
            Отправить
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="avatar-wrap" style={{ margin: '0 auto', width: 128, height: 128 }}>
            <SvetlanaAvatar emotion={emotion} size={128} />
            <span className={`emotion-ring ${ringClass}`} />
          </div>
          <h3 style={{ marginTop: 12 }}>Светлана</h3>
          <p className="muted small">Эмоция связана с результатом действий, а не случайна</p>
        </div>

        <div className="card">
          <h3>Что я умею</h3>
          <div className="stack">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-sm" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Статусы действий</h3>
          <p className="small muted">
            <span className="badge ok">VERIFIED</span> — выполнено и подтверждено.<br />
            <span className="badge warn">NOT PROVEN</span> — выполнено, но без подтверждения.<br />
            <span className="badge err">FAILED</span> — не выполнено.<br />
            <span className="badge warn">BLOCKED</span> — требует подтверждения.
          </p>
        </div>
      </div>
    </div>
  );
}
