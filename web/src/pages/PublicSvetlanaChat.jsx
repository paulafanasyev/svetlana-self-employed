import { useState } from 'react';
import { publicAi } from '../api.js';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

const SUGGESTIONS = ['Что умеет Светлана?', 'Что такое «Мир Самозанятых»?', 'Как начать работать как самозанятый?', 'Где проверить правила по НПД?'];

export default function PublicSvetlanaChat() {
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Здравствуйте. Я Светлана. Здесь можно задать мне вопрос без регистрации. В публичном режиме я консультирую и рассказываю о возможностях сервиса.' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(value) {
    const message = String(value ?? input).trim();
    if (!message || busy) return;
    const history = messages.slice(-10);
    setInput('');
    setError('');
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const result = await publicAi.chat({ message, history });
      setMessages((items) => [...items, { role: 'assistant', content: result?.content || 'Не удалось получить ответ. Попробуйте ещё раз.' }]);
    } catch (err) {
      setError(err?.message || 'Светлана сейчас недоступна.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="site-section">
      <div className="site-container site-two-col">
        <div className="site-card">
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <SvetlanaAvatar emotion={busy ? 'THINKING' : 'IDLE'} size={56} />
            <div><span className="site-eyebrow">Публичный чат</span><h2 style={{ margin: 0 }}>Светлана</h2></div>
          </div>

          <div className="chat-messages" style={{ minHeight: 320, maxHeight: 460, marginTop: 18 }}>
            {messages.map((item, index) => (
              <div key={index} className={item.role === 'user' ? 'msg user' : 'msg'}>
                {item.role === 'assistant' && <div className="avatar-wrap"><SvetlanaAvatar emotion={busy && index === messages.length - 1 ? 'THINKING' : 'IDLE'} size={34} /></div>}
                <div><div className="who">{item.role === 'user' ? 'Вы' : 'Светлана'}</div><div className="bubble">{item.content}</div></div>
              </div>
            ))}
            {busy && <div className="msg"><div className="avatar-wrap"><SvetlanaAvatar emotion="THINKING" size={34} /></div><div className="bubble muted">Светлана думает…</div></div>}
          </div>

          {error && <div className="alert err" role="alert" style={{ marginTop: 12 }}>{error}</div>}

          <div className="chat-input" style={{ marginTop: 12 }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Напишите вопрос Светлане…" disabled={busy} aria-label="Сообщение Светлане" />
            <button className="site-btn site-btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>Отправить</button>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Публичный режим не имеет доступа к личному кабинету.</p>
        </div>

        <div className="site-card">
          <span className="site-eyebrow">Без регистрации</span>
          <h2>Познакомьтесь со Светланой прямо на сайте</h2>
          <p>Задавайте вопросы о платформе, возможностях для самозанятых и навигации по сервису.</p>
          <div className="site-actions" style={{ flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((item) => <button key={item} className="site-btn site-btn-soft" onClick={() => send(item)} disabled={busy}>{item}</button>)}
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>Для CRM и персональных действий используется защищённое рабочее пространство после входа.</p>
        </div>
      </div>
    </section>
  );
}
