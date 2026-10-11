/**
 * Светлана встречает посетителя при первом входе на сайт и знакомится:
 * спрашивает, как к человеку обращаться, и дальше говорит с ним по имени
 * (имя хранится только в этом браузере). Никаких заранее записанных
 * обращений «к одному человеку» — каждый посетитель слышит своё имя.
 *
 * Голос: серверный синтез (если настроен) → голос браузера (ru-RU).
 * Браузеры не включают звук без действия пользователя, поэтому голос звучит
 * после нажатия, а весь текст всегда виден на экране.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SvetlanaAvatar } from './SvetlanaAvatar.jsx';
import { svetlanaVoice } from '../lib/svetlanaVoice.js';
import {
  INTRO_TEXT, greetingFor, normalizeName, getVisitorName, saveVisitorName,
  openSvetlanaChat, wasSeen, markSeen,
} from './welcomeText.js';
import './SvetlanaWelcome.css';

export { INTRO_TEXT, greetingFor, normalizeName, getVisitorName, openSvetlanaChat };
export { openSvetlanaWelcome } from './welcomeText.js';


export default function SvetlanaWelcome({ delay = 900, knownName = '' }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('ask'); // ask | hello
  const [name, setName] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const helloRef = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => svetlanaVoice.subscribe((s) => setSpeaking(s.speaking)), []);

  const show = useCallback(() => {
    lastFocus.current = document.activeElement;
    // Имя, которое посетитель сам назвал Светлане, — сразу «привет».
    // Имя из профиля только подставляем в поле: человек подтверждает, как к нему обращаться.
    const remembered = getVisitorName();
    setName(remembered);
    setInput(remembered || knownName);
    setError('');
    setStep(remembered ? 'hello' : 'ask');
    setOpen(true);
  }, [knownName]);

  useEffect(() => {
    const onOpen = () => show();
    window.addEventListener('sv:open-welcome', onOpen);
    let timer = 0;
    const isBot = typeof navigator !== 'undefined' && /bot|crawl|spider|lighthouse|headlesschrome\/.*pagespeed/i.test(navigator.userAgent || '');
    if (!wasSeen() && !isBot) timer = window.setTimeout(show, delay);
    return () => {
      window.removeEventListener('sv:open-welcome', onOpen);
      window.clearTimeout(timer);
    };
  }, [delay, show]);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => (step === 'ask' ? inputRef.current : helloRef.current)?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, step]);

  const close = useCallback(() => {
    svetlanaVoice.stop();
    markSeen();
    setOpen(false);
    const back = lastFocus.current;
    if (back && typeof back.focus === 'function') window.setTimeout(() => back.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open || !dialogRef.current) return undefined;
    const hidden = [];
    for (let node = dialogRef.current.parentElement; node && node !== document.body; node = node.parentElement) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const sib of parent.children) if (sib !== node && !sib.hasAttribute('inert')) hidden.push(sib);
    }
    hidden.forEach((el) => el.setAttribute('inert', ''));
    return () => hidden.forEach((el) => el.removeAttribute('inert'));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll('button, a[href], input')].filter((n) => !n.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  function say(text) {
    svetlanaVoice.unlock();
    if (!svetlanaVoice.state.enabled) svetlanaVoice.setEnabled(true);
    svetlanaVoice.speak(text);
  }

  function introduce(event) {
    event.preventDefault();
    const clean = normalizeName(input);
    if (input.trim() && !clean) {
      setError('Напишите имя буквами, например: Анна');
      return;
    }
    setError('');
    setName(clean);
    saveVisitorName(clean);
    setStep('hello');
    say(greetingFor(clean));
  }

  function skip() {
    setName('');
    setStep('hello');
    say(greetingFor(''));
  }

  if (!open) return null;

  const text = step === 'ask' ? INTRO_TEXT : greetingFor(name);

  return (
    <div className="svw-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section ref={dialogRef} className="svw-card" role="dialog" aria-modal="true" aria-labelledby="svw-title" aria-describedby="svw-text">
        <button type="button" className="svw-close" onClick={close} aria-label="Закрыть приветствие">×</button>

        <div className="svw-media">
          <SvetlanaAvatar live fullHead voiceControls={false} emotion={speaking ? 'HAPPY' : step === 'ask' ? 'QUESTION' : 'IDLE'} size={232} />
          {speaking && <span className="svw-live" aria-hidden="true">● говорит</span>}
        </div>

        <div className="svw-body">
          <span className="svw-eyebrow">Помощница «Мира Самозанятых»</span>
          <h2 id="svw-title">{step === 'ask' ? 'Здравствуйте, я Светлана' : name ? `${name}, добро пожаловать!` : 'Добро пожаловать!'}</h2>
          <p id="svw-text" className="svw-text" aria-live="polite">{text}</p>

          {step === 'ask' ? (
            <form className="svw-form" onSubmit={introduce} noValidate>
              <label htmlFor="svw-name" className="svw-label">Ваше имя</label>
              <div className="svw-form-row">
                <input
                  ref={inputRef}
                  id="svw-name"
                  className="svw-input"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setError(''); }}
                  placeholder="Например, Анна"
                  autoComplete="given-name"
                  maxLength={40}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'svw-err' : undefined}
                />
                <button type="submit" className="svw-btn svw-btn-primary" disabled={!input.trim()}>Познакомиться</button>
              </div>
              {error && <p id="svw-err" className="svw-note" role="alert">{error}</p>}
              <div className="svw-actions svw-actions-sub">
                <button type="button" className="svw-btn svw-btn-ghost" onClick={() => say(INTRO_TEXT)}>▶ Послушать Светлану</button>
                <button type="button" className="svw-btn svw-btn-ghost" onClick={skip}>Без имени</button>
              </div>
            </form>
          ) : (
            <div className="svw-actions">
              <button ref={helloRef} type="button" className="svw-btn svw-btn-primary" onClick={() => { close(); openSvetlanaChat(); }}>Задать вопрос</button>
              <Link className="svw-btn" to="/register" onClick={close}>Начать бесплатно</Link>
              {speaking
                ? <button type="button" className="svw-btn svw-btn-ghost" onClick={() => svetlanaVoice.stop()}>■ Тише</button>
                : <button type="button" className="svw-btn svw-btn-ghost" onClick={() => say(text)}>▶ Повторить</button>}
              <button type="button" className="svw-btn svw-btn-ghost" onClick={() => setStep('ask')}>{name ? 'Я не ' + name : 'Представиться'}</button>
            </div>
          )}
          <p className="svw-fine">Имя хранится только в вашем браузере и не отправляется на сервер. Светлана — цифровая помощница и не заменяет консультацию ФНС: важное проверяем по официальным источникам.</p>
        </div>
      </section>
    </div>
  );
}
