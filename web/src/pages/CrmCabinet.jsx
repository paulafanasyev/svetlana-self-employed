/**
 * CRM Светланы в личном кабинете — по образцу CRM из Svetlana 2.0:
 * контакты, сделки (воронка), задачи, сводка и данные. Работает на устройстве
 * пользователя (local-first), понимает команды Светланы текстом и голосом,
 * а изменения выполняет только после подтверждения.
 *
 * Добавлено для самозанятых: плательщик сделки (НПД 4% / 6%), отметка
 * «чек сформирован в „Мой налог“», оценка налога и контроль лимита 2,4 млн ₽.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { crm as crmApi } from '../api.js';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';
import { svetlanaVoice } from '../lib/svetlanaVoice.js';
import {
  crmStore, CONTACT_STATUSES, DEAL_STAGES, STAGE_LABELS, ACTIVITY_TYPES, PAYERS,
  NPD_YEAR_LIMIT, LIMITS, money,
} from '../crm/crmStore.js';
import { parseCommand, runCommand } from '../crm/crmCommands.js';
import { Icon } from '../crm/icons.jsx';
import '../crm/crm.css';

const TABS = [
  ['contacts', 'Контакты', 'users'],
  ['deals', 'Сделки', 'briefcase'],
  ['tasks', 'Задачи', 'check'],
  ['summary', 'Сводка', 'chart'],
  ['data', 'Данные', 'database'],
];
const MY_TAX = 'https://lknpd.nalog.ru/';
const ru = (ts, withTime = false) => (ts ? new Date(ts).toLocaleString('ru-RU', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

function useCrm() {
  const store = crmStore();
  useSyncExternalStore(store.subscribe, () => store.revision);
  return store;
}

function readFile(file, max) {
  return new Promise((resolve, reject) => {
    if (file.size > max) return reject(new Error(`Файл больше ${Math.round(max / 1024 / 1024)} МБ`));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'utf-8');
  });
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───────────────────────── confirmation (ActionGate) ─────────────────────────

function ConfirmDialog({ cmd, source, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="crm-modal-backdrop">
      <div className="crm-modal" role="alertdialog" aria-modal="true" aria-labelledby="crm-confirm-title" aria-describedby="crm-confirm-desc">
        <span className="crm-pill">{source === 'voice' ? 'Распознано голосом' : 'Предложено Светланой'}</span>
        <h3 id="crm-confirm-title">{cmd.title}</h3>
        <dl className="crm-dl">
          {cmd.fields.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p id="crm-confirm-desc" className="crm-muted">Проверьте данные. Светлана выполнит действие только после вашего подтверждения.</p>
        <div className="crm-row crm-end">
          <button ref={cancelRef} type="button" className="crm-btn crm-btn-ghost" onClick={onCancel}>Отмена</button>
          <button type="button" className="crm-btn crm-btn-primary" onClick={onConfirm}>Выполнить</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Svetlana command bar ─────────────────────────

function SvetlanaBar({ store, onDone }) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('Скажите или напишите, что сделать: «добавь клиента Анна +7 900 000-00-00», «сделка маникюр 2500 для Анна», «напомни завтра отправить счёт», «сводка».');
  const [pending, setPending] = useState(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  function say(msg) {
    setReply(msg);
    svetlanaVoice.speak(msg);
  }

  function execute(value, source = 'text') {
    const cmd = parseCommand(value, store);
    if (!cmd) return say(runCommand(null, store).text);
    if (cmd.kind === 'write' || source === 'voice') { setPending({ cmd, source }); return undefined; }
    const res = runCommand(cmd, store);
    say(res.text);
    onDone?.(cmd, res);
    return undefined;
  }

  function confirm() {
    const { cmd } = pending;
    setPending(null);
    try {
      const res = runCommand(cmd, store, { confirmed: true });
      say(res.text);
      onDone?.(cmd, res);
      setText('');
    } catch (e) {
      say(e.message || 'Не получилось выполнить.');
    }
  }

  function listen() {
    if (!SR) return;
    if (listening) { recRef.current?.stop(); return; }
    svetlanaVoice.stop();
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const heard = e.results?.[0]?.[0]?.transcript || '';
      setText(heard);
      if (heard) execute(heard, 'voice');
    };
    rec.onerror = () => setReply('Не расслышала. Проверьте доступ к микрофону и попробуйте ещё раз.');
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <section className="crm-card crm-svetlana" aria-label="Команды Светланы">
      <div className="crm-sv-head">
        <SvetlanaAvatar live size={48} voiceControls={false} emotion={pending ? 'QUESTION' : 'IDLE'} />
        <div className="crm-sv-reply" aria-live="polite">{reply}</div>
      </div>
      <form className="crm-sv-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) execute(text.trim()); }}>
        <label className="crm-sr" htmlFor="crm-sv-input">Команда для Светланы</label>
        <input id="crm-sv-input" className="crm-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: добавь клиента Анна +7 912 345-67-89" autoComplete="off" />
        {SR && (
          <button type="button" className={'crm-btn crm-btn-ghost crm-icon-btn' + (listening ? ' is-live' : '')} onClick={listen} aria-label={listening ? 'Остановить запись' : 'Сказать голосом'} aria-pressed={listening}>
            <Icon name="mic" />
          </button>
        )}
        <button type="submit" className="crm-btn crm-btn-primary" disabled={!text.trim()}><Icon name="sparkle" /> Выполнить</button>
      </form>
      {pending && <ConfirmDialog cmd={pending.cmd} source={pending.source} onCancel={() => { setPending(null); setReply('Отменено.'); }} onConfirm={confirm} />}
    </section>
  );
}

// ───────────────────────── Contacts ─────────────────────────

function ContactForm({ store, contact, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: contact?.name || '',
    phones: contact?.phones.join(', ') || '',
    emails: contact?.emails.join(', ') || '',
    company: contact?.company || '',
    position: contact?.position || '',
    status: contact?.status || 'lead',
    tags: contact?.tags.join(', ') || '',
    notes: contact?.notes || '',
  }));
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const saved = contact ? store.updateContact(contact.id, f) : store.addContact(f);
      onSaved(saved.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="crm-card crm-pad crm-stack" onSubmit={submit} aria-label={contact ? 'Редактировать контакт' : 'Новый контакт'}>
      <div className="crm-row crm-between">
        <h3 className="crm-h3">{contact ? 'Редактировать контакт' : 'Новый контакт'}</h3>
        <button type="button" className="crm-btn crm-btn-ghost crm-icon-btn" onClick={onClose} aria-label="Закрыть"><Icon name="x" /></button>
      </div>
      <input className="crm-input" value={f.name} onChange={set('name')} placeholder="Имя *" aria-label="Имя" autoFocus required />
      <div className="crm-grid2">
        <input className="crm-input" value={f.phones} onChange={set('phones')} placeholder="Телефоны (через запятую)" aria-label="Телефоны" inputMode="tel" />
        <input className="crm-input" value={f.emails} onChange={set('emails')} placeholder="E-mail (через запятую)" aria-label="E-mail" inputMode="email" />
        <input className="crm-input" value={f.company} onChange={set('company')} placeholder="Компания" aria-label="Компания" />
        <input className="crm-input" value={f.position} onChange={set('position')} placeholder="Должность" aria-label="Должность" />
        <select className="crm-input" value={f.status} onChange={set('status')} aria-label="Статус">
          {Object.entries(CONTACT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="crm-input" value={f.tags} onChange={set('tags')} placeholder="Теги (через запятую)" aria-label="Теги" />
      </div>
      <textarea className="crm-input crm-textarea" value={f.notes} onChange={set('notes')} placeholder="Заметки" aria-label="Заметки" />
      {error && <p className="crm-error" role="alert">{error}</p>}
      <div className="crm-row crm-end"><button type="submit" className="crm-btn crm-btn-primary" disabled={!f.name.trim()}>Сохранить</button></div>
    </form>
  );
}

function ContactDetail({ store, contact, onEdit, onDeleted }) {
  const [type, setType] = useState('note');
  const [text, setText] = useState('');
  const deals = store.listDeals({ contactId: contact.id });
  const history = store.listActivities({ contactId: contact.id });

  function addHistory(e) {
    e.preventDefault();
    if (!text.trim()) return;
    store.addActivity({ type, text, contactId: contact.id });
    setText('');
  }

  return (
    <div className="crm-card crm-pad crm-stack">
      <div className="crm-row crm-between crm-top">
        <div>
          <h3 className="crm-h3">{contact.name}</h3>
          <p className="crm-muted crm-small">{[contact.position, contact.company].filter(Boolean).join(' · ') || 'Без компании'} · {CONTACT_STATUSES[contact.status]}</p>
        </div>
        <div className="crm-row">
          <button type="button" className="crm-btn crm-btn-ghost" onClick={onEdit}><Icon name="pencil" /> Изменить</button>
          <button type="button" className="crm-btn crm-btn-ghost crm-icon-btn crm-danger" aria-label="Удалить" onClick={() => { if (window.confirm(`Удалить контакт «${contact.name}»? Сделки и история останутся без привязки.`)) { store.deleteContact(contact.id); onDeleted(); } }}><Icon name="trash" /></button>
        </div>
      </div>

      {(contact.phones.length > 0 || contact.emails.length > 0) && (
        <div className="crm-links">
          {contact.phones.map((p) => <a key={p} href={'tel:' + p.replace(/[^\d+]/g, '')}><Icon name="phone" /> {p}</a>)}
          {contact.emails.map((m) => <a key={m} href={'mailto:' + m}><Icon name="mail" /> {m}</a>)}
        </div>
      )}
      {contact.tags.length > 0 && <div className="crm-tags">{contact.tags.map((t) => <span key={t} className="crm-tag">{t}</span>)}</div>}
      {contact.notes && <p className="crm-pre">{contact.notes}</p>}
      {contact.lastContactAt && <p className="crm-muted crm-small">Последний контакт: {ru(contact.lastContactAt, true)}</p>}

      <div>
        <h4 className="crm-h4">Сделки</h4>
        {deals.length ? deals.map((d) => (
          <div key={d.id} className="crm-line"><span>{d.title}</span><span className="crm-muted">{STAGE_LABELS[d.stage]} · {money(d.amount, d.currency)}</span></div>
        )) : <p className="crm-muted crm-small">Сделок пока нет</p>}
      </div>

      <div>
        <h4 className="crm-h4">История</h4>
        <form className="crm-row" onSubmit={addHistory}>
          <select className="crm-input crm-w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Тип записи">
            {['note', 'call', 'meeting', 'message'].map((k) => <option key={k} value={k}>{ACTIVITY_TYPES[k]}</option>)}
          </select>
          <input className="crm-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Что было?" aria-label="Что было?" />
          <button type="submit" className="crm-btn crm-btn-primary crm-icon-btn" disabled={!text.trim()} aria-label="Добавить запись"><Icon name="plus" /></button>
        </form>
        <div className="crm-history">
          {history.length ? history.map((a) => (
            <div key={a.id} className="crm-history-item">
              <span className="crm-muted crm-small">{ru(a.createdAt, true)} · {ACTIVITY_TYPES[a.type]}</span>
              <span>{a.text}</span>
            </div>
          )) : <p className="crm-muted crm-small">Пока пусто</p>}
        </div>
      </div>
    </div>
  );
}

function ContactsTab({ store, selected, setSelected }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState(null); // null | 'new' | 'edit'
  const all = store.listContacts({ q, status });
  const shown = all.slice(0, LIMITS.listCap);
  const current = selected ? store.getContact(selected) : null;

  return (
    <div className="crm-contacts">
      <div className="crm-stack">
        <div className="crm-row">
          <div className="crm-search">
            <Icon name="search" />
            <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: имя, телефон, компания, тег" aria-label="Поиск контактов" />
          </div>
          <button type="button" className="crm-btn crm-btn-primary" onClick={() => { setSelected(null); setMode('new'); }}><Icon name="plus" /> Контакт</button>
        </div>
        <div className="crm-row crm-between">
          <select className="crm-input crm-w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Фильтр по статусу">
            <option value="">Все статусы</option>
            {Object.entries(CONTACT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="crm-muted crm-small">Найдено: {all.length}{all.length > LIMITS.listCap ? ` (показаны первые ${LIMITS.listCap}, уточните поиск)` : ''}</span>
        </div>
        <div className="crm-card crm-list" role="list">
          {shown.length ? shown.map((c) => (
            <button key={c.id} type="button" role="listitem" className={'crm-list-row' + (c.id === selected ? ' is-active' : '')} onClick={() => { setSelected(c.id); setMode(null); }}>
              <span className="crm-row crm-between"><strong>{c.name}</strong><span className={'crm-status crm-status-' + c.status}>{CONTACT_STATUSES[c.status]}</span></span>
              <span className="crm-muted crm-small">{[c.phones[0], c.company].filter(Boolean).join(' · ') || '—'}</span>
            </button>
          )) : (
            <p className="crm-empty">{q || status ? 'Никого не нашли. Измените поиск или фильтр.' : 'Контактов нет. Добавьте вручную, скажите Светлане или импортируйте CSV на вкладке «Данные».'}</p>
          )}
        </div>
      </div>
      <div>
        {mode === 'new' && <ContactForm store={store} onClose={() => setMode(null)} onSaved={(id) => { setSelected(id); setMode(null); }} />}
        {mode === 'edit' && current && <ContactForm store={store} contact={current} onClose={() => setMode(null)} onSaved={() => setMode(null)} />}
        {!mode && current && <ContactDetail store={store} contact={current} onEdit={() => setMode('edit')} onDeleted={() => setSelected(null)} />}
        {!mode && !current && (
          <div className="crm-card crm-pad crm-placeholder">
            <Icon name="users" size={28} />
            <p>Выберите контакт слева или добавьте новый.</p>
            <p className="crm-muted crm-small">Телефоны кликабельны, история звонков и встреч хранится в карточке клиента.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Deals ─────────────────────────

function DealsTab({ store }) {
  const contacts = store.listContacts();
  const [f, setF] = useState({ title: '', contactId: '', amount: '', payer: 'person' });
  const [error, setError] = useState('');
  const deals = store.listDeals();

  function submit(e) {
    e.preventDefault();
    setError('');
    try {
      store.addDeal({ ...f, contactId: f.contactId || undefined });
      setF({ title: '', contactId: '', amount: '', payer: f.payer });
    } catch (err) {
      setError(err.message || 'Не удалось создать сделку');
    }
  }

  return (
    <div className="crm-stack">
      <form className="crm-card crm-pad crm-deal-form" onSubmit={submit} aria-label="Новая сделка">
        <input className="crm-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Название сделки *" aria-label="Название сделки" />
        <select className="crm-input" value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })} aria-label="Клиент">
          <option value="">Без контакта</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="crm-input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Сумма, ₽" aria-label="Сумма, ₽" inputMode="decimal" />
        <select className="crm-input" value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })} aria-label="Кто платит">
          {Object.entries(PAYERS).map(([k, v]) => <option key={k} value={k}>{v} · НПД {k === 'person' ? '4%' : '6%'}</option>)}
        </select>
        <button type="submit" className="crm-btn crm-btn-primary" disabled={!f.title.trim()}><Icon name="plus" /> Сделка</button>
        {error && <p className="crm-error crm-span" role="alert">{error}</p>}
      </form>

      <div className="crm-board">
        {DEAL_STAGES.map(([stage, label], index) => {
          const items = deals.filter((d) => d.stage === stage);
          const total = items.reduce((s, d) => s + d.amount, 0);
          return (
            <section key={stage} className={'crm-card crm-column crm-col-' + stage} aria-label={label}>
              <header>
                <h4 className="crm-h4">{label}</h4>
                <span className="crm-muted crm-small">{items.length} · {money(total)}</span>
              </header>
              {items.map((d) => {
                const who = d.contactId ? store.getContact(d.contactId)?.name : null;
                return (
                  <article key={d.id} className="crm-deal">
                    <strong>{d.title}</strong>
                    <span className="crm-muted crm-small">{who || 'Без контакта'} · {PAYERS[d.payer]}</span>
                    <span className="crm-amount">{money(d.amount, d.currency)}</span>
                    {stage === 'won' && (
                      <label className={'crm-receipt' + (d.receipt ? ' is-ok' : '')}>
                        <input type="checkbox" checked={d.receipt} onChange={(e) => store.updateDeal(d.id, { receipt: e.target.checked })} />
                        {d.receipt ? 'Чек сформирован' : 'Сформировать чек в «Мой налог»'}
                      </label>
                    )}
                    <div className="crm-deal-actions">
                      <button type="button" className="crm-btn crm-btn-ghost crm-icon-btn" onClick={() => store.moveDeal(d.id, 'back')} disabled={index === 0} aria-label={`Назад: ${d.title}`}><Icon name="left" /></button>
                      <button type="button" className="crm-btn crm-btn-ghost crm-icon-btn crm-danger" onClick={() => { if (window.confirm(`Удалить сделку «${d.title}»?`)) store.deleteDeal(d.id); }} aria-label={`Удалить: ${d.title}`}><Icon name="trash" /></button>
                      <button type="button" className="crm-btn crm-btn-ghost crm-icon-btn" onClick={() => store.moveDeal(d.id, 'forward')} disabled={index === DEAL_STAGES.length - 1} aria-label={`Вперёд: ${d.title}`}><Icon name="right" /></button>
                    </div>
                  </article>
                );
              })}
              {!items.length && <p className="crm-muted crm-small crm-col-empty">Пусто</p>}
            </section>
          );
        })}
      </div>
      <p className="crm-muted crm-small">Оплату получили — переведите сделку в «Выиграна» и сразу сформируйте чек в «Мой налог»: по закону чек нужен на каждое поступление.</p>
    </div>
  );
}

// ───────────────────────── Tasks ─────────────────────────

function TasksTab({ store }) {
  const contacts = store.listContacts();
  const [f, setF] = useState({ text: '', contactId: '', due: '' });
  const [showDone, setShowDone] = useState(false);
  const now = Date.now();
  const list = showDone ? store.listActivities({ type: 'task' }) : store.listActivities({ openTasks: true });

  function submit(e) {
    e.preventDefault();
    if (!f.text.trim()) return;
    store.addActivity({ type: 'task', text: f.text, contactId: f.contactId || undefined, dueAt: f.due ? new Date(`${f.due}T09:00`).getTime() : undefined });
    setF({ text: '', contactId: '', due: '' });
  }

  return (
    <div className="crm-stack crm-narrow">
      <form className="crm-card crm-pad crm-task-form" onSubmit={submit} aria-label="Новая задача">
        <input className="crm-input crm-span2" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Что сделать? *" aria-label="Что сделать?" />
        <select className="crm-input" value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })} aria-label="Клиент">
          <option value="">Без контакта</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="crm-input" type="date" min={today()} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} aria-label="Срок" />
        <button type="submit" className="crm-btn crm-btn-primary crm-span-all" disabled={!f.text.trim()}><Icon name="plus" /> Добавить задачу</button>
      </form>
      <label className="crm-check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Показывать выполненные</label>
      <div className="crm-card">
        {list.length ? list.map((t) => {
          const overdue = !t.done && t.dueAt && t.dueAt < now;
          const who = t.contactId ? store.getContact(t.contactId)?.name : null;
          return (
            <div key={t.id} className="crm-task">
              <input type="checkbox" checked={t.done} onChange={(e) => store.setTaskDone(t.id, e.target.checked)} aria-label={`Выполнено: ${t.text}`} />
              <div className="crm-task-body">
                <span className={t.done ? 'crm-done' : ''}>{t.text}</span>
                <span className={'crm-small ' + (overdue ? 'crm-overdue' : 'crm-muted')}>
                  {[who, t.dueAt ? 'до ' + ru(t.dueAt) : null, overdue ? 'просрочено' : null].filter(Boolean).join(' · ') || 'без срока'}
                </span>
              </div>
              <button type="button" className="crm-btn crm-btn-ghost crm-icon-btn crm-danger" onClick={() => store.deleteActivity(t.id)} aria-label={`Удалить задачу: ${t.text}`}><Icon name="trash" /></button>
            </div>
          );
        }) : <p className="crm-empty">Задач нет</p>}
      </div>
    </div>
  );
}

// ───────────────────────── Summary ─────────────────────────

function Kpi({ label, value, tone }) {
  return <div className={'crm-card crm-kpi' + (tone ? ' crm-kpi-' + tone : '')}><span className="crm-muted crm-small">{label}</span><strong>{value}</strong></div>;
}

function SummaryTab({ store }) {
  const s = store.stats();
  const maxStage = Math.max(1, ...DEAL_STAGES.map(([k]) => s.byStage[k].amount));
  const share = Math.min(1, s.npdLimitShare);
  return (
    <div className="crm-stack">
      <div className="crm-kpis">
        <Kpi label="Контакты" value={s.contacts} />
        <Kpi label="Клиенты" value={s.byStatus.client} />
        <Kpi label="Лиды" value={s.byStatus.lead} />
        <Kpi label="Открытые сделки" value={`${s.openDeals} · ${money(s.pipelineValue)}`} />
        <Kpi label="Выиграно" value={`${s.wonDeals} · ${money(s.wonValue)}`} tone="good" />
        <Kpi label="Задачи" value={`${s.openTasks}${s.overdueTasks ? ` (просрочено ${s.overdueTasks})` : ''}`} tone={s.overdueTasks ? 'bad' : ''} />
      </div>

      <div className="crm-two">
        <section className="crm-card crm-pad">
          <h4 className="crm-h4">Воронка</h4>
          {DEAL_STAGES.map(([k, label]) => (
            <div key={k} className="crm-funnel-row">
              <span>{label}</span>
              <div className="crm-bar"><i className={'crm-bar-' + k} style={{ width: (s.byStage[k].amount / maxStage) * 100 + '%' }} /></div>
              <span className="crm-muted crm-small">{s.byStage[k].count} · {money(s.byStage[k].amount)}</span>
            </div>
          ))}
          <p className="crm-muted crm-small">Конверсия закрытых сделок: {s.conversion}%</p>
        </section>

        <section className="crm-card crm-pad crm-npd" aria-label="Налог на профессиональный доход">
          <h4 className="crm-h4"><Icon name="receipt" /> НПД за {new Date().getFullYear()} год</h4>
          <div className="crm-line"><span>Доход по выигранным сделкам</span><strong>{money(s.yearIncome)}</strong></div>
          <div className="crm-line"><span>Оценка налога (4% с физлиц, 6% с ИП и организаций)</span><strong>{money(s.npdEstimate)}</strong></div>
          <div className="crm-limit" aria-label={`Использовано ${Math.round(share * 100)}% годового лимита`}>
            <div className="crm-bar"><i className={share >= 0.9 ? 'crm-bar-lost' : 'crm-bar-won'} style={{ width: share * 100 + '%' }} /></div>
            <span className="crm-small crm-muted">Лимит НПД — {money(NPD_YEAR_LIMIT)} в год. Использовано {Math.round(share * 100)}%.</span>
          </div>
          {share >= 0.9 && <p className="crm-warn">До лимита НПД осталось меньше 10%. Если доход превысит {money(NPD_YEAR_LIMIT)}, режим НПД нельзя применять до конца года — заранее выберите другой режим.</p>}
          {s.receiptsMissing > 0 && <p className="crm-warn">Нет отметки о чеке по {s.receiptsMissing} оплаченным сделкам. Чек формируется в «Мой налог» на каждое поступление.</p>}
          <p className="crm-muted crm-small">Оценка без учёта налогового вычета 10 000 ₽ (он снижает ставку до 3% и 4%, пока не израсходован). Точная сумма — в приложении «Мой налог».</p>
          <a className="crm-btn crm-btn-ghost" href={MY_TAX} target="_blank" rel="noopener noreferrer">Открыть «Мой налог» ↗</a>
        </section>
      </div>
    </div>
  );
}

// ───────────────────────── Data ─────────────────────────

const SERVER_STATUS = { lead: 'lead', client: 'active', partner: 'active', other: 'paused' };

function DataTab({ store }) {
  const [msg, setMsg] = useState({});
  const [syncing, setSyncing] = useState(false);
  const csvRef = useRef(null);
  const jsonRef = useRef(null);
  const date = today();
  const unsynced = store.data.contacts.filter((c) => !c.serverId).length;
  const report = (key, text) => setMsg((m) => ({ ...m, [key]: text }));

  async function onCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = store.importCSV(await readFile(file, LIMITS.csvBytes));
      report('csv', `CSV: добавлено ${r.added}, обновлено ${r.merged}, пропущено ${r.skipped}.`);
    } catch (err) { report('csv', err.message); }
  }

  async function onJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Заменить все данные CRM содержимым файла?')) { report('json', 'Отменено'); return; }
    try {
      const r = store.importJSON(await readFile(file, LIMITS.backupBytes));
      report('json', `Восстановлено: контактов ${r.contacts}, сделок ${r.deals}, записей ${r.activities}.`);
    } catch (err) { report('json', err.message); }
  }

  async function syncToAccount() {
    setSyncing(true);
    let done = 0; let failed = 0;
    for (const c of store.data.contacts.filter((x) => !x.serverId)) {
      try {
        const row = await crmApi.createClient({
          type: 'person',
          name: c.name.slice(0, 200),
          email: c.emails[0] || null,
          phone: c.phones[0]?.slice(0, 40) || null,
          position: c.position.slice(0, 120) || null,
          status: SERVER_STATUS[c.status] || 'lead',
          tags: c.tags.slice(0, 30),
          notes: [c.company && `Компания: ${c.company}`, c.notes].filter(Boolean).join('\n').slice(0, 8000) || null,
          source: 'crm-svetlana',
        });
        store.updateContact(c.id, { serverId: row?.id || 'synced' });
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setSyncing(false);
    report('sync', failed ? `Перенесено ${done}, не удалось ${failed}. Проверьте соединение и повторите.` : `Перенесено в аккаунт: ${done}.`);
  }

  return (
    <div className="crm-data">
      <section className="crm-card crm-pad crm-stack">
        <h4 className="crm-h4"><Icon name="download" /> CSV (Excel, Google Таблицы)</h4>
        <p className="crm-muted crm-small">Колонки: Имя, Телефоны, E-mail, Компания. Дубли по телефону и e-mail объединяются.</p>
        <div className="crm-row">
          <button type="button" className="crm-btn crm-btn-ghost" onClick={() => download(`crm-contacts-${date}.csv`, store.exportCSV(), 'text/csv;charset=utf-8')}><Icon name="download" /> Экспорт</button>
          <button type="button" className="crm-btn crm-btn-ghost" onClick={() => csvRef.current?.click()}><Icon name="upload" /> Импорт</button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
        </div>
        {msg.csv && <p className="crm-small" role="status">{msg.csv}</p>}
      </section>

      <section className="crm-card crm-pad crm-stack">
        <h4 className="crm-h4"><Icon name="database" /> Резервная копия</h4>
        <p className="crm-muted crm-small">Все контакты, сделки и задачи одним файлом. Подходит и для Svetlana 2.0. Восстановление заменяет текущие данные.</p>
        <div className="crm-row">
          <button type="button" className="crm-btn crm-btn-ghost" onClick={() => download(`crm-backup-${date}.json`, store.exportJSON(), 'application/json')}><Icon name="download" /> Сохранить</button>
          <button type="button" className="crm-btn crm-btn-ghost" onClick={() => jsonRef.current?.click()}><Icon name="upload" /> Восстановить</button>
          <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={onJson} />
        </div>
        {msg.json && <p className="crm-small" role="status">{msg.json}</p>}
      </section>

      <section className="crm-card crm-pad crm-stack">
        <h4 className="crm-h4"><Icon name="cloud" /> Перенести в аккаунт</h4>
        <p className="crm-muted crm-small">Копирует контакты в раздел «Клиенты» вашего аккаунта, чтобы они были доступны с других устройств. Не перенесено: {unsynced}.</p>
        <div className="crm-row"><button type="button" className="crm-btn crm-btn-ghost" onClick={syncToAccount} disabled={syncing || !unsynced}>{syncing ? 'Переношу…' : 'Перенести'}</button></div>
        {msg.sync && <p className="crm-small" role="status">{msg.sync}</p>}
      </section>

      <section className="crm-card crm-pad crm-stack crm-danger-card">
        <h4 className="crm-h4 crm-danger"><Icon name="trash" /> Очистить CRM</h4>
        <p className="crm-muted crm-small">Удалит все данные CRM на этом устройстве. Сначала сделайте резервную копию.</p>
        <div className="crm-row"><button type="button" className="crm-btn crm-btn-danger" onClick={() => { if (window.confirm('Удалить ВСЕ данные CRM?')) { store.clear(); report('clear', 'CRM очищена'); } }}><Icon name="trash" /> Очистить</button></div>
        {msg.clear && <p className="crm-small" role="status">{msg.clear}</p>}
      </section>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────

export default function CrmCabinet() {
  const store = useCrm();
  const [tab, setTab] = useState(() => {
    const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
    return TABS.some(([id]) => id === h) ? h : 'contacts';
  });
  const [selected, setSelected] = useState(null);
  const s = store.stats();
  const badges = useMemo(() => ({ contacts: s.contacts, deals: s.openDeals, tasks: s.openTasks }), [s.contacts, s.openDeals, s.openTasks]);

  useEffect(() => {
    try { history.replaceState(null, '', '#' + tab); } catch { /* ignore */ }
  }, [tab]);

  function onSvetlana(cmd, res) {
    if (cmd.tool === 'crm_add_contact' && res.id) { setTab('contacts'); setSelected(res.id); }
    if (cmd.tool === 'crm_find_contacts' && res.ids?.length) { setTab('contacts'); setSelected(res.ids[0]); }
    if (cmd.tool === 'crm_create_deal') setTab('deals');
    if (cmd.tool === 'crm_add_task') setTab('tasks');
    if (cmd.tool === 'crm_stats') setTab('summary');
  }

  return (
    <div className="crm">
      <header className="crm-head">
        <div>
          <h2 className="crm-title"><Icon name="users" size={24} /> CRM Светланы</h2>
          <p className="crm-muted crm-small">Клиенты, сделки и задачи хранятся на этом устройстве и работают даже без интернета. Светлана управляет CRM по вашей команде.</p>
        </div>
      </header>

      <SvetlanaBar store={store} onDone={onSvetlana} />

      <nav className="crm-tabs" role="tablist" aria-label="Разделы CRM">
        {TABS.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={'crm-tab-' + id}
            aria-selected={tab === id}
            aria-controls={'crm-panel-' + id}
            className={'crm-tab' + (tab === id ? ' is-active' : '')}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} /> {label}
            {badges[id] > 0 && <span className="crm-badge">{badges[id]}</span>}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id={'crm-panel-' + tab} aria-labelledby={'crm-tab-' + tab}>
        {tab === 'contacts' && <ContactsTab store={store} selected={selected} setSelected={setSelected} />}
        {tab === 'deals' && <DealsTab store={store} />}
        {tab === 'tasks' && <TasksTab store={store} />}
        {tab === 'summary' && <SummaryTab store={store} />}
        {tab === 'data' && <DataTab store={store} />}
      </div>
    </div>
  );
}
