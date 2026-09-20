/**
 * Настройки — приватность и безопасность (§40).
 * Экспорт данных, удаление аккаунта, реестр согласий и раскрытие
 * маршрутизации запросов к ИИ. Всё по-честному: превью экспорта
 * строится из реальных данных, согласия переключаются через API.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useResource, Badge, EmptyState, ErrorState, fmtDate, confirmAction } from '../ui.jsx';

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const consents = useResource(() => api.get('/auth/consents'), []);

  const [dump, setDump] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState(null);

  const [pwd, setPwd] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [busyScope, setBusyScope] = useState(null);
  const [consentError, setConsentError] = useState(null);

  const doExport = async () => {
    setExportBusy(true);
    setExportError(null);
    try {
      const data = await auth.exportData();
      setDump(data);
    } catch (err) {
      setExportError(err);
    } finally {
      setExportBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const doDelete = async () => {
    setDeleteError(null);
    if (!pwd) { setDeleteError('Введите пароль для подтверждения'); return; }
    if (!confirmAction('Удалить аккаунт навсегда? Все данные будут стёрты. Это действие необратимо.')) return;
    setDeleteBusy(true);
    try {
      await auth.deleteAccount(pwd);
      await logout();
      navigate('/');
    } catch (err) {
      setDeleteError(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleConsent = async (scope, granted) => {
    setConsentError(null);
    setBusyScope(scope);
    try {
      await api.post('/auth/consents', { scope, granted });
      await consents.reload();
    } catch (err) {
      setConsentError(err);
    } finally {
      setBusyScope(null);
    }
  };

  const rows = Array.isArray(consents.data) ? consents.data : [];
  // Реестр — история: текущее состояние по области — последняя запись.
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.scope)) latest.set(r.scope, r);

  return (
    <div className="stack">
      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Экспорт данных</h3>
        <p className="muted small">
          Выгрузка содержит ваши данные из всех таблиц платформы (клиенты,
          сделки, документы, диалоги и т.д.). Поля паролей и токенов
          исключаются. Сначала покажем состав — потом можно скачать.
        </p>
        {exportError && (
          <div className="alert err" role="alert">
            Не удалось выгрузить данные: {exportError.message ?? String(exportError)}
          </div>
        )}
        {exportBusy && <p className="muted">Собираю данные…</p>}
        {!dump && !exportBusy && !exportError && (
          <button className="btn" onClick={doExport}>Получить выгрузку</button>
        )}
        {dump && (
          <>
            <div className="card" style={{ padding: 0, overflow: 'hidden', margin: '12px 0' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead><tr><th>Таблица</th><th>Записей</th></tr></thead>
                  <tbody>
                    {Object.entries(dump).map(([table, items]) => (
                      <tr key={table}>
                        <td className="small">{table}</td>
                        <td className="small">{Array.isArray(items) ? items.length : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={download}>⬇ Скачать JSON</button>
              <button className="btn" onClick={doExport}>Обновить превью</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Реестр согласий</h3>
        <p className="muted small">
          Каждое изменение согласия — отдельная запись (152-ФЗ). Текущее
          состояние области — последняя запись по ней.
        </p>
        {consentError && (
          <div className="alert err" role="alert">
            Не удалось изменить согласие: {consentError.message ?? String(consentError)}
          </div>
        )}
        {consents.loading && <p className="muted">Загружаю согласия…</p>}
        {!consents.loading && consents.error && <ErrorState error={consents.error} onRetry={consents.reload} />}
        {!consents.loading && !consents.error && rows.length === 0 && (
          <EmptyState icon="📋" title="Согласий нет"
            hint="Записи появятся после первого согласия при регистрации" />
        )}
        {!consents.loading && !consents.error && rows.length > 0 && (
          <>
            {[...latest.values()].map((r) => (
              <div key={r.scope} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <strong>{r.scope}</strong>
                  <div className="muted small">
                    {r.granted ? 'выдано' : 'отозвано'} · политика {r.policy_version} · {fmtDate(r.created_at)}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  disabled={busyScope === r.scope}
                  onClick={() => toggleConsent(r.scope, !r.granted)}>
                  {busyScope === r.scope ? '…' : r.granted ? 'Отозвать' : 'Выдать'}
                </button>
              </div>
            ))}
            <details style={{ marginTop: 12 }}>
              <summary className="small muted">Вся история изменений ({rows.length})</summary>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table className="data">
                  <thead><tr><th>Область</th><th>Статус</th><th>Политика</th><th>Дата</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.scope}-${r.created_at}-${i}`}>
                        <td className="small">{r.scope}</td>
                        <td><Badge status={r.granted ? 'ok' : 'err'}>{r.granted ? 'выдано' : 'отозвано'}</Badge></td>
                        <td className="small muted">{r.policy_version}</td>
                        <td className="small muted">{fmtDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Маршрутизация запросов к ИИ</h3>
        <p className="small" style={{ margin: '0 0 8px' }}>
          Запросы к Светлане обрабатываются провайдерами искусственного
          интеллекта, подключёнными в серверной конфигурации платформы.
          Состав провайдеров и моделей определяется на стороне сервера и
          может меняться без уведомления.
        </p>
        <p className="small" style={{ margin: '0 0 8px' }}>
          Журнал диалогов и выполненных действий хранится в вашем аккаунте
          и доступен для экспорта в разделе выше.
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          Согласие на обработку данных можно отозвать в любой момент —
          это фиксируется в реестре согласий.
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Удаление аккаунта</h3>
        <p className="muted small">
          Аккаунт {user?.email ? <strong>{user.email}</strong> : ''} будет удалён
          вместе со всеми связанными данными. Для подтверждения введите пароль.
        </p>
        {deleteError && (
          <div className="alert err" role="alert">
            {deleteError.message ?? String(deleteError)}
          </div>
        )}
        <div className="row">
          <div className="field" style={{ margin: 0, flex: '1 1 240px' }}>
            <label htmlFor="delete-pwd">Пароль</label>
            <input id="delete-pwd" type="password" value={pwd}
              onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn btn-danger" onClick={doDelete} disabled={deleteBusy}
            style={{ alignSelf: 'flex-end' }}>
            {deleteBusy ? 'Удаляю…' : 'Удалить аккаунт'}
          </button>
        </div>
      </div>
    </div>
  );
}
