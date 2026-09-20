/**
 * Документы — конвейер §16:
 *   запрос → вопросы → данные → генерация → проверка → предпросмотр →
 *   утверждение → документ → хранение → отправка (опц.) → верификация.
 *
 * Каждый шаг идёт в настоящий backend. Ссылка «Скачать DOCX» появляется
 * только после того, как approve действительно создал файл (docx_path).
 */
import { useEffect, useState } from 'react';
import { documents, getAccessToken } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, confirmAction,
} from '../ui.jsx';

const KIND_LABELS = {
  contract: 'Договор', act: 'Акт', invoice: 'Счёт', kp: 'КП',
  offer: 'Оферта', nda: 'NDA', tz: 'ТЗ', appendix: 'Приложение', other: 'Другое',
};
const STATUS_LABELS = {
  draft: 'Черновик', questions: 'Вопросы', data: 'Данные', generated: 'Сгенерирован',
  preview: 'Предпросмотр', approved: 'Утверждён', stored: 'Сохранён',
  sent_email: 'Отправлен', sent_sign: 'Отправлен на подпись',
  verified: 'Верифицирован', archived: 'В архиве', rejected: 'Отклонён',
};
const STATUSES = Object.keys(STATUS_LABELS);
const PIPELINE = [
  ['draft', 'Запрос'], ['questions', 'Вопросы'], ['data', 'Данные'],
  ['generated', 'Генерация'], ['preview', 'Проверка и предпросмотр'],
  ['approved', 'Утверждение'], ['stored', 'Документ сохранён'],
  ['sent_email', 'Отправка'], ['verified', 'Верификация'],
];
const TERMINAL = { archived: 'Архивирован', rejected: 'Отклонён' };
const SENT = ['sent_email', 'sent_sign', 'verified'];
const FINAL = ['stored', ...SENT, 'archived'];
const PREVIEWABLE = ['generated', 'preview', 'approved', ...FINAL];
const BOX = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 };

const parseJson = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

/** Индекс текущего шага конвейера по статусу документа. */
function stepIndex(status) {
  if (status === 'sent_sign') return 7;
  if (TERMINAL[status]) return PIPELINE.length;
  return Math.max(0, PIPELINE.findIndex(([s]) => s === status));
}

export default function Documents() {
  const { data, loading, error, reload, setData } = useResource(() => documents.list(), []);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const rows = data?.data ?? [];

  const create = async (body) => {
    const doc = await documents.create(body);
    setData((d) => ({ ...d, data: [doc, ...(d?.data ?? [])] }));
    setCreating(false);
    setSelectedId(doc.id);
  };

  const remove = async (doc) => {
    if (!confirmAction(`Удалить документ «${doc.title}»? Это действие необратимо.`)) return;
    await documents.delete(doc.id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== doc.id) }));
    if (selectedId === doc.id) setSelectedId(null);
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Документы</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Создать документ</button>
      </div>

      {creating && <CreateDoc onCreate={create} onCancel={() => setCreating(false)} />}

      {selectedId && (
        <DocDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={(d) => setData((s) => ({ ...s, data: (s?.data ?? []).map((r) => (r.id === d.id ? d : r)) }))}
          onDeleted={(deletedId) => {
            setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== deletedId) }));
            setSelectedId(null);
          }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю документы…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="📄"
            title="Документов пока нет"
            hint="Нажмите «Создать документ» и выберите шаблон: договор, акт, счёт, КП, оферта, NDA, ТЗ или приложение."
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Документ</th><th>Вид</th><th>Статус</th><th>Создан</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ textAlign: 'left' }}
                        onClick={() => setSelectedId(d.id)}
                      >
                        <strong>{d.title}</strong>
                      </button>
                    </td>
                    <td className="small">{KIND_LABELS[d.kind] ?? d.kind}</td>
                    <td><Badge status={d.status}>{STATUS_LABELS[d.status] ?? d.status}</Badge></td>
                    <td className="small muted">{fmtDate(d.created_at)}</td>
                    <td>
                      {!FINAL.includes(d.status) && (
                        <button className="btn btn-sm btn-danger" onClick={() => remove(d)}>Удалить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && <p className="small muted">Всего документов: {rows.length}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DocDetail({ id, onClose, onUpdated, onDeleted }) {
  const { data: doc, loading, error, reload } = useResource(() => documents.get(id), [id]);
  const q = useResource(() => documents.questions(id), [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);

  const idx = doc ? stepIndex(doc.status) : 0;

  // Готовый предпросмотр — если документ уже был сгенерирован ранее.
  useEffect(() => {
    if (doc && !preview && PREVIEWABLE.includes(doc.status)) {
      documents.preview(id).then(setPreview).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.status, id]);

  // Реальный DOCX появляется только после утверждения. Качаем его с
  // авторизацией и отдаём браузеру; фиктивных ссылок до approve не бывает.
  useEffect(() => {
    if (!doc?.docx_path) { setFileUrl(null); return; }
    let url;
    (async () => {
      try {
        const res = await fetch(documents.downloadUrl(id), {
          headers: { authorization: `Bearer ${getAccessToken()}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        setFileUrl(url);
      } catch (e) { setErr(new Error(`Файл недоступен: ${e.message}`)); }
    })();
    return () => url && URL.revokeObjectURL(url);
  }, [doc?.status, doc?.docx_path, id]);

  /** Выполнить шаг конвейера: обновить список/деталь или показать ошибку. */
  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await fn();
      onUpdated(updated);
      await reload();
      return { updated };
    } catch (e) {
      setErr(e);
      return { error: e };
    } finally {
      setBusy(false);
    }
  };

  const saveData = async (values) => {
    const r = await run(() => documents.setData(id, { data: values }));
    if (r.updated) q.reload();
  };

  const generate = async () => {
    const r = await run(() => documents.generate(id));
    if (r.updated) {
      setPreview(await documents.preview(id).catch(() => null));
    } else if (r.error?.code === 'missing_fields') {
      // backend вернул документ на шаг вопросов — обновим список вопросов.
      q.reload();
      reload();
    }
  };

  const approve = () => run(() => documents.approve(id));
  const sendDoc = (body) => run(() => documents.send(id, body));
  const transition = (status) => {
    if (status !== doc.status) run(() => documents.setStatus(id, { status }));
  };

  const del = async () => {
    if (!confirmAction(`Удалить документ «${doc.title}»? Это действие необратимо.`)) return;
    await documents.delete(id);
    onDeleted(id);
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !doc) return <div className="card"><p className="muted">Загружаю документ…</p></div>;

  const evidence = parseJson(doc.sent_evidence);
  const canApprove = ['data', 'generated', 'preview'].includes(doc.status);
  const drafty = !FINAL.includes(doc.status);
  const hasFile = !!doc.docx_path;

  return (
    <div className="card stack">
      <div className="row between">
        <div>
          <h3 style={{ margin: 0 }}>{doc.title}</h3>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {KIND_LABELS[doc.kind] ?? doc.kind} · создан {fmtDate(doc.created_at)}
          </p>
        </div>
        <div className="row">
          <Badge status={doc.status}>{STATUS_LABELS[doc.status] ?? doc.status}</Badge>
          <button className="btn btn-sm" onClick={onClose}>Закрыть</button>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {PIPELINE.map(([s, label], i) => (
          <span
            key={s}
            className={`badge ${i < idx ? 'ok' : i === idx ? 'warn' : ''}`}
            style={i >= idx ? { opacity: 0.45 } : undefined}
          >
            {i + 1}. {label}
          </span>
        ))}
        {TERMINAL[doc.status] && <span className="badge err">{TERMINAL[doc.status]}</span>}
      </div>

      {err && (
        <div className="alert err" role="alert">
          <strong>Действие не выполнено.</strong> {err.message}
        </div>
      )}

      {/* Шаг 1. Вопросы → данные */}
      <div style={BOX}>
        <div className="row between">
          <h4 style={{ margin: 0 }}>Шаг 1. Вопросы и данные</h4>
          {q.data && <span className="small muted">Заполнено: {q.data.answered} из {q.data.total}</span>}
        </div>
        {q.loading && <p className="small muted" style={{ margin: '8px 0 0' }}>Загружаю вопросы…</p>}
        {q.error && <p className="small" style={{ margin: '8px 0 0' }}>Не удалось загрузить вопросы: {q.error.message}</p>}
        {q.data && q.data.questions.length === 0 && (
          <p className="small" style={{ margin: '8px 0 0' }}>
            {q.data.total > 0
              ? '✓ Все обязательные поля заполнены — можно генерировать предпросмотр.'
              : 'У шаблона нет обязательных полей.'}
          </p>
        )}
        {q.data && q.data.questions.length > 0 && (
          <QuestionsForm
            key={`${id}:${q.data.questions.length}`}
            questions={q.data.questions}
            existing={parseJson(doc.data_json)}
            busy={busy}
            onSave={saveData}
          />
        )}
      </div>

      {/* Шаг 2. Генерация → проверка → предпросмотр */}
      <div style={BOX}>
        <div className="row between">
          <h4 style={{ margin: 0 }}>Шаг 2. Генерация и предпросмотр</h4>
          <button className="btn btn-sm btn-primary" onClick={generate} disabled={busy}>
            Сгенерировать предпросмотр
          </button>
        </div>
        {preview ? (
          <iframe
            srcDoc={preview}
            title="Предпросмотр документа"
            style={{ width: '100%', height: 520, marginTop: 10, border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}
          />
        ) : (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Заполните данные и сгенерируйте предпросмотр — он появится в этой рамке.
          </p>
        )}
      </div>

      {/* Шаг 3. Утверждение → документ → хранение → отправка */}
      <div style={BOX}>
        <h4 style={{ margin: 0 }}>Шаг 3. Утверждение, файл и отправка</h4>
        {canApprove && (
          <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={approve} disabled={busy}>
            Утвердить документ
          </button>
        )}
        {!canApprove && !hasFile && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Утверждение станет доступным после генерации предпросмотра.
          </p>
        )}
        {hasFile && fileUrl && (
          <div className="row" style={{ marginTop: 10 }}>
            <a className="btn btn-primary" href={fileUrl} download={`${doc.title}.docx`}>
              ⬇ Скачать DOCX
            </a>
            <span className="small muted">Файл создан при утверждении документа.</span>
          </div>
        )}
        {hasFile && !fileUrl && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>Подготавливаю файл для скачивания…</p>
        )}

        {SENT.includes(doc.status) && evidence && (
          <div className="alert ok" style={{ marginTop: 10 }}>
            Документ отправлен получателю. Канал: {evidence.channel ?? 'email'}
            {evidence.message_id ? `, идентификатор: ${evidence.message_id}` : ''}.
          </div>
        )}

        {doc.status === 'stored' && (
          <SendForm busy={busy} onSend={sendDoc} />
        )}
      </div>

      <div className="row between">
        <div className="row">
          <span className="small muted">Перевести в статус:</span>
          <select value={doc.status} onChange={(e) => transition(e.target.value)} disabled={busy}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
          </select>
        </div>
        {drafty && (
          <button className="btn btn-danger" onClick={del} disabled={busy}>Удалить черновик</button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function QuestionsForm({ questions, existing, busy, onSave }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    questions.map((qs) => [qs.key, existing[qs.key] ?? qs.default ?? ''])
  ));
  const set = (key, v) => setValues((s) => ({ ...s, [key]: v }));
  const inputType = (t) => (t === 'number' ? 'number' : t === 'date' ? 'date' : 'text');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(values); }}>
      <div className="grid grid-2">
        {questions.map((qs) => (
          <div className="field" key={qs.key} style={{ marginBottom: 0 }}>
            <label htmlFor={`q-${qs.key}`}>{qs.label}</label>
            {qs.type === 'text' ? (
              <textarea
                id={`q-${qs.key}`} rows={2} value={values[qs.key] ?? ''}
                onChange={(e) => set(qs.key, e.target.value)}
              />
            ) : (
              <input
                id={`q-${qs.key}`} type={inputType(qs.type)} value={values[qs.key] ?? ''}
                onChange={(e) => set(qs.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 12 }}>
        Сохранить данные
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function SendForm({ busy, onSend }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');

  return (
    <form
      style={{ marginTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSend({ to: to.trim(), subject: subject.trim() || undefined });
      }}
    >
      <div className="grid grid-2">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="send-to">Email получателя *</label>
          <input id="send-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="send-subj">Тема письма</label>
          <input
            id="send-subj" value={subject} placeholder="По умолчанию — название документа"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      </div>
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12 }}>
        Отправить письмом
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function CreateDoc({ onCreate, onCancel }) {
  const { data, loading, error } = useResource(() => documents.templates(), []);
  const [tplId, setTplId] = useState(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState(null);

  const tpls = data?.data ?? [];

  const submit = (e) => {
    e.preventDefault();
    setErr(null);
    const tpl = tpls.find((t) => t.id === tplId);
    if (!tpl) { setErr('Выберите шаблон документа'); return; }
    if (!title.trim()) { setErr('Укажите название документа'); return; }
    onCreate({ kind: tpl.slug, template_id: tpl.id, title: title.trim() });
  };

  return (
    <div className="card">
      <h3>Создать документ</h3>
      {error && <div className="alert err" role="alert">{error.message}</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      {loading && <p className="muted">Загружаю шаблоны…</p>}
      {!loading && tpls.length === 0 && (
        <p className="muted">Активные шаблоны не найдены — добавьте шаблон в справочник.</p>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label>Шаблон *</label>
          <div className="grid grid-2">
            {tpls.map((t) => (
              <label
                key={t.id}
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                  border: `1px solid ${tplId === t.id ? '#7c3aed' : '#e5e7eb'}`,
                  borderRadius: 8, padding: 10,
                }}
              >
                <input
                  type="radio" name="tpl" checked={tplId === t.id}
                  onChange={() => setTplId(t.id)} style={{ width: 'auto', marginTop: 2 }}
                />
                <span>
                  <strong>{t.title}</strong>
                  <br />
                  <span className="small muted">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="d-title">Название документа *</label>
          <input
            id="d-title" value={title} placeholder="Например: Договор с ООО Вектор"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">Создать</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
