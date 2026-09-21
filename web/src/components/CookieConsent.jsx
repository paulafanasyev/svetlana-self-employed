import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const CONSENT_COOKIE = 'ms_cookie_consent';
const ANALYTICS_COOKIE = 'ms_analytics_id';
const CONSENT_VERSION = '2.0';
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
const ANALYTICS_MAX_AGE = 60 * 60 * 24 * 90;

function readCookie(name) {
  const prefix = name + '=';
  const found = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

function writeCookie(name, value, maxAge) {
  document.cookie = [
    name + '=' + encodeURIComponent(value),
    'Max-Age=' + maxAge,
    'Path=/',
    'SameSite=Lax',
    location.protocol === 'https:' ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function deleteCookie(name) {
  writeCookie(name, '', 0);
}

function parseConsent() {
  try {
    const raw = readCookie(CONSENT_COOKIE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function analyticsAllowed() {
  const consent = parseConsent();
  return consent?.version === CONSENT_VERSION && consent?.analytics === true;
}

export function getCookieConsent() {
  return parseConsent();
}

export function setCookieConsent(next) {
  const consent = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: Boolean(next.analytics),
    updated_at: new Date().toISOString(),
  };
  writeCookie(CONSENT_COOKIE, JSON.stringify(consent), CONSENT_MAX_AGE);
  if (consent.analytics) {
    if (!readCookie(ANALYTICS_COOKIE)) writeCookie(ANALYTICS_COOKIE, createId(), ANALYTICS_MAX_AGE);
  } else {
    deleteCookie(ANALYTICS_COOKIE);
  }
  window.dispatchEvent(new Event('cookie-consent-change'));
}

export function resetCookieConsent() {
  deleteCookie(CONSENT_COOKIE);
  deleteCookie(ANALYTICS_COOKIE);
  window.dispatchEvent(new Event('cookie-consent-change'));
}

async function sendAnalyticsEvent(type, path) {
  if (!analyticsAllowed()) return;
  const session = readCookie(ANALYTICS_COOKIE);
  if (!session) return;
  const payload = {
    event_type: type,
    path: path.split('?')[0].slice(0, 120) || '/',
    session_id: session,
    referrer_origin: (() => {
      try { return document.referrer ? new URL(document.referrer).origin : null; } catch { return null; }
    })(),
  };
  try {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    if (!base) return;
    await fetch(base + '/public/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'omit',
    });
  } catch {
    // Analytics must never make the public site fail.
  }
}

export function CookieSettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="site-cookie-settings-link" type="button" onClick={() => setOpen(true)}>
        Настройки cookie
      </button>
      {open && <CookieConsentModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CookieConsentModal({ onClose }) {
  const current = parseConsent();
  const [analytics, setAnalytics] = useState(Boolean(current?.analytics));

  const save = () => {
    setCookieConsent({ analytics });
    onClose();
  };

  return (
    <div className="site-cookie-overlay" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
      <div className="site-cookie-dialog">
        <div className="site-cookie-dialog-head">
          <div>
            <span className="site-eyebrow">Настройки cookie</span>
            <h2 id="cookie-title">Управление данными сайта</h2>
          </div>
          <button type="button" className="site-icon-button" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <label className="site-cookie-option">
          <span><strong>Необходимые</strong><small>Нужны для запоминания настроек сайта. Отключить их нельзя, если вы пользуетесь этими функциями.</small></span>
          <input type="checkbox" checked disabled />
        </label>
        <label className="site-cookie-option">
          <span><strong>Аналитические</strong><small>Нужны для внутреннего отчёта: просмотры страниц, даты и обезличенный идентификатор сессии. Рекламного профилирования нет.</small></span>
          <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
        </label>
        <div className="site-cookie-dialog-actions">
          <button type="button" className="site-btn site-btn-soft" onClick={onClose}>Отмена</button>
          <button type="button" className="site-btn site-btn-primary" onClick={save}>Сохранить выбор</button>
        </div>
      </div>
    </div>
  );
}

export default function CookieConsent() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const consent = parseConsent();
      setOpen(!consent || consent.version !== CONSENT_VERSION);
    };
    refresh();
    const onChange = () => refresh();
    window.addEventListener('cookie-consent-change', onChange);
    return () => window.removeEventListener('cookie-consent-change', onChange);
  }, []);

  useEffect(() => {
    if (!analyticsAllowed()) return undefined;
    const path = location.pathname || '/';
    const key = 'ms_last_tracked_path';
    try {
      const previous = JSON.parse(sessionStorage.getItem(key) || 'null');
      const now = Date.now();
      if (previous?.path === path && now - Number(previous.time || 0) < 30 * 60 * 1000) return undefined;
      sessionStorage.setItem(key, JSON.stringify({ path, time: now }));
    } catch {}
    void sendAnalyticsEvent('page_view', path);
    return undefined;
  }, [location.pathname]);

  useEffect(() => {
    const onConsent = () => {
      if (analyticsAllowed()) void sendAnalyticsEvent('consent_analytics_granted', window.location.pathname);
    };
    window.addEventListener('cookie-consent-change', onConsent);
    return () => window.removeEventListener('cookie-consent-change', onConsent);
  }, []);

  if (settingsOpen) {
    return <CookieConsentModal onClose={() => setSettingsOpen(false)} />;
  }

  if (!open) return null;

  return (
    <div className="site-cookie-banner" role="region" aria-label="Настройки cookie">
      <div>
        <strong>Cookie и приватность</strong>
        <p>Мы используем необходимые cookie для работы сайта. Аналитические cookie включаются отдельно и используются только для внутреннего отчёта о посещаемости.</p>
        <span>Подробнее: <a href={(import.meta.env.BASE_URL || '/') + 'privacy'}>Политика конфиденциальности</a> · <a href={(import.meta.env.BASE_URL || '/') + 'cookies'}>Политика cookie</a></span>
      </div>
      <div className="site-cookie-actions">
        <button type="button" className="site-btn site-btn-soft" onClick={() => { setCookieConsent({ analytics: false }); }}>Только необходимые</button>
        <button type="button" className="site-btn site-btn-soft" onClick={() => setSettingsOpen(true)}>Настроить</button>
        <button type="button" className="site-btn site-btn-primary" onClick={() => { setCookieConsent({ analytics: true }); }}>Разрешить аналитику</button>
      </div>
    </div>
  );
}

export function useAnalyticsPageview(pathname) {
  useEffect(() => {
    if (analyticsAllowed()) void sendAnalyticsEvent('page_view', pathname);
  }, [pathname]);
}
