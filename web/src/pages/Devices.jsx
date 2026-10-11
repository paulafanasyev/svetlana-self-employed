/**
 * «Мои устройства»: компьютер (Светлана 2.0 для Windows) и телефон (Svetlana-Home),
 * их версии, состояние защиты и установленные локальные модели. Привязка — одноразовым кодом.
 * Сюда не передаются клиенты, финансы, голос или переписка: только служебные сведения.
 */
import { useEffect, useState } from 'react';
import { devices as devicesApi } from '../api.js';

const PLATFORM = { windows: '💻 Компьютер (Windows)', android: '📱 Телефон (Android)' };
const CHECKS = [
  ['secrets_encrypted', 'Ключи зашифрованы'],
  ['bridge_v2', 'Защищённый мост ПК ↔ телефон'],
  ['voice_enrolled', 'Голос владельца записан'],
  ['confirm_gate', 'Подтверждение действий'],
];

function fmtTime(ts) {
  return ts ? new Date(ts * 1000).toLocaleString('ru-RU') : '—';
}

export default function Devices() {
  const [list, setList] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      const [d, c] = await Promise.all([devicesApi.list(), devicesApi.catalog()]);
      setList(d.devices ?? []);
      setCatalog(c);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const makeCode = async () => {
    try { setCode(await devicesApi.linkCode()); } catch (e) { setError(e.message); }
  };
  const revoke = async (id) => {
    if (!window.confirm('Отключить устройство? Оно перестанет передавать сведения в кабинет.')) return;
    try { await devicesApi.revoke(id); await load(); } catch (e) { setError(e.message); }
  };

  const has = (p) => (list ?? []).some((d) => d.platform === p);

  return (
    <div className="stack">
      <section className="card">
        <h2>Привязать устройство</h2>
        <p className="muted">Получите код и введите его в приложении «Светлана»: Настройки → Личный кабинет. Код действует 10 минут и подходит один раз.</p>
        <p className="muted"><strong>Никому не сообщайте код</strong>: ни «поддержке», ни по телефону. Кто введёт код, тот привяжет своё устройство к вашему кабинету.</p>
        <button className="btn btn-primary" onClick={makeCode}>Получить код</button>
        {code && <p style={{ fontSize: 28, letterSpacing: 4, fontFamily: 'monospace' }}>{code.code} <small className="muted">до {fmtTime(code.expires_at)}</small></p>}
        {list && (!has('windows') || !has('android')) && (
          <p className="muted">Для работы в связке нужны оба приложения: {has('windows') ? '' : 'компьютер '}{has('android') ? '' : 'телефон'} ещё не привязан. <a href="/downloads">Скачать</a></p>
        )}
      </section>

      {error && <div className="card err">{error}</div>}

      <section className="card">
        <h2>Мои устройства</h2>
        {!list && <p className="muted">Загрузка…</p>}
        {list && list.length === 0 && <p className="muted">Пока нет привязанных устройств.</p>}
        {list && list.map((d) => (
          <div key={d.id} className="card" style={{ marginTop: 12 }}>
            <div className="row between">
              <strong>{PLATFORM[d.platform] ?? d.platform} · {d.name}</strong>
              <span className={'badge ' + (d.online ? 'ok' : '')}>{d.online ? '● в сети' : '○ не в сети'}</span>
            </div>
            <p className="muted">Версия {d.app_version || '—'} · последний сигнал {fmtTime(d.last_seen_at)}</p>
            <p className="muted small">Состояние защиты по данным самого устройства:</p>
            <ul>
              {CHECKS.map(([k, label]) => (
                <li key={k}>{d.status?.[k] ? '✅' : '⚠️'} {label}</li>
              ))}
            </ul>
            {d.models?.length > 0 && <p>Локальные модели: {d.models.map((m) => m.id).join(', ')}</p>}
            <button className="btn btn-sm" onClick={() => revoke(d.id)}>Отключить</button>
          </div>
        ))}
      </section>

      {catalog && (
        <section className="card">
          <h2>Локальные модели ИИ</h2>
          <p className="muted">Скачиваются в приложении и работают без интернета. Только модели с лицензией для коммерческого использования.</p>
          <table className="table">
            <thead><tr><th>Модель</th><th>Назначение</th><th>Где</th><th>Размер</th><th>Лицензия</th></tr></thead>
            <tbody>
              {catalog.models.map((m) => (
                <tr key={m.id}>
                  <td>{m.id}{m.tier === 'default' ? ' ★' : ''}</td>
                  <td>{m.note}</td>
                  <td>{m.platforms.map((p) => (p === 'windows' ? 'ПК' : 'телефон')).join(', ')}</td>
                  <td>{m.size_mb >= 1000 ? (m.size_mb / 1000).toFixed(1) + ' ГБ' : m.size_mb + ' МБ'}</td>
                  <td>{m.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">★ ставится по умолчанию. Не включены из‑за лицензий: {catalog.excluded.map((x) => x.id).join(', ')}.</p>
        </section>
      )}
    </div>
  );
}
