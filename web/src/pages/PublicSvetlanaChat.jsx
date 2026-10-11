import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';
import { svetlanaVoice } from '../lib/svetlanaVoice.js';
import { getVisitorName, openSvetlanaWelcome } from '../components/welcomeText.js';
import { answerFor } from '../components/svetlanaAnswers.js';

const SUGGESTIONS = ['Что умеет Светлана?', 'Как стать самозанятым?', 'Сколько платить налога на НПД?', 'Как вести клиентов в CRM?'];

const greeting = (name) => `Здравствуйте${name ? ', ' + name : ''}! Я Светлана. Здесь можно задать мне вопрос без регистрации: о работе самозанятых, налоге НПД, чеках и возможностях платформы.`;

export default function PublicSvetlanaChat() {
  const [name, setName] = useState(getVisitorName);
  const [messages, setMessages] = useState(() => [{ role: 'assistant', content: greeting(getVisitorName()) }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onName = (e) => {
      setName(e.detail || '');
      setMessages((items) => (items.length === 1 ? [{ role: 'assistant', content: greeting(e.detail) }] : items));
    };
    window.addEventListener('sv:name', onName);
    return () => window.removeEventListener('sv:name', onName);
  }, []);

  async function send(value) {
    const message = String(value ?? input).trim();
    if (!message || busy) return;
    const history = messages.slice(-10);
    setInput('');
    svetlanaVoice.stop();
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setBusy(true);
    let content = '';
    try {
      const result = await api.post('/public/chat', { message: (name ? `[Меня зовут ${name}] ` : '') + message.slice(0, 3900), history });
      content = String(result?.content || '').trim();
    } catch { /* сервер недоступен — отвечаем проверенной справкой */ }
    if (!content) content = answerFor(message);
    svetlanaVoice.speak(content);
    setMessages((items) => [...items, { role: 'assistant', content }]);
    setBusy(false);
  }

  return (
    <>
      <section className="site-section">
        <div className="site-container">
          <div className="site-card" style={{ textAlign: 'center' }}>
            <div className="sv-svetlana-hero-avatar">
              <SvetlanaAvatar live fullHead emotion={busy ? 'THINKING' : 'IDLE'} size={360} />
            </div>
            <h2 style={{ marginTop: 14, marginBottom: 6 }}>{name ? `${name}, я Светлана` : 'Светлана'}</h2>
            <p className="muted small">Отвечаю на вопросы о платформе, работе и НПД — текстом и голосом. Важные сведения проверяйте по официальным источникам.</p>
            {!name && <p><button type="button" className="site-btn site-btn-soft" onClick={openSvetlanaWelcome}>Познакомиться</button></p>}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container site-two-col">
          <div className="site-card">
            <div className="row" style={{ alignItems: 'center', gap: 12 }}>
              <SvetlanaAvatar live emotion={busy ? 'THINKING' : 'IDLE'} size={56} />
              <div><span className="site-eyebrow">Чат без регистрации</span><h2 style={{ margin: 0 }}>Светлана</h2></div>
            </div>

            <div className="chat-messages" style={{ minHeight: 320, maxHeight: 460, marginTop: 18 }} role="log" aria-live="polite">
              {messages.map((item, index) => (
                <div key={index} className={item.role === 'user' ? 'msg user' : 'msg'}>
                  {item.role === 'assistant' && <div className="avatar-wrap"><SvetlanaAvatar emotion="IDLE" size={34} live={false} /></div>}
                  <div><div className="who">{item.role === 'user' ? (name || 'Вы') : 'Светлана'}</div><div className="bubble">{item.content}</div></div>
                </div>
              ))}
              {busy && <div className="msg"><div className="avatar-wrap"><SvetlanaAvatar emotion="THINKING" size={34} live={false} /></div><div className="bubble muted">Светлана думает…</div></div>}
            </div>

            <div className="chat-input" style={{ marginTop: 12 }}>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Напишите вопрос Светлане…" disabled={busy} aria-label="Сообщение Светлане" maxLength={3900} />
              <button className="site-btn site-btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>Отправить</button>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>В этом чате у Светланы нет доступа к вашему кабинету и данным.</p>
          </div>

          <div className="site-card">
            <span className="site-eyebrow">Без регистрации</span>
            <h2>Спросите Светлану прямо сейчас</h2>
            <p>Задавайте вопросы о платформе, работе самозанятых и налоге НПД.</p>
            <div className="site-actions" style={{ flexWrap: 'wrap' }}>
              {SUGGESTIONS.map((item) => <button key={item} className="site-btn site-btn-soft" onClick={() => send(item)} disabled={busy}>{item}</button>)}
            </div>
            <p className="small muted" style={{ marginTop: 16 }}>В личном кабинете Светлана ведёт вашу CRM: добавляет клиентов, сделки и напоминания — только после вашего подтверждения.</p>
          </div>
        </div>
      </section>
    </>
  );
}
