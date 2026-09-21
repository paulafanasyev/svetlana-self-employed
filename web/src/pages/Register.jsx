import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    display_name: '', email: '', password: '', role: 'user',
    consent_personal_data: false, accept_terms: false, consent_ai_processing: false,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.consent_personal_data || !form.accept_terms) {
      setError('Нужно принять Соглашение пользователя и дать согласие на обработку персональных данных.');
      return;
    }
    setBusy(true);
    try {
      await register({
        display_name: form.display_name,
        email: form.email,
        password: form.password,
        role: form.role,
        consent_personal_data: form.consent_personal_data,
        accept_terms: form.accept_terms,
        consent_ai_processing: form.consent_ai_processing,
      });
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось зарегистрироваться.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content" style={{ maxWidth: 520, paddingTop: 40 }}>
      <div className="card">
        <div className="row" style={{ marginBottom: 16 }}>
          <SvetlanaAvatar emotion="LISTENING" size={48} />
          <div>
            <h2 style={{ margin: 0 }}>Регистрация</h2>
            <p className="muted small" style={{ margin: 0 }}>Потом вы попадёте в рабочее пространство</p>
          </div>
        </div>

        {error && <div className="alert err" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Как вас зовут</label>
            <input id="name" required minLength={2} maxLength={80}
              value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input id="password" type="password" autoComplete="new-password" required minLength={8}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="small muted" style={{ margin: '4px 0 0' }}>Минимум 8 символов</p>
          </div>
          <div className="field">
            <label htmlFor="role">Кто вы</label>
            <select id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Самозанятый / специалист</option>
              <option value="expert">Эксперт (продаю обучение)</option>
              <option value="training_center">Учебный центр</option>
            </select>
          </div>
          <div className="field site-register-consents">
            <label className="row" style={{ gap: 8, textTransform: 'none', fontWeight: 400, alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={form.consent_personal_data}
                onChange={(e) => setForm({ ...form, consent_personal_data: e.target.checked })} />
              <span className="small">Я даю согласие на обработку персональных данных в соответствии с <Link to="/privacy">Политикой конфиденциальности</Link>.</span>
            </label>
            <label className="row" style={{ gap: 8, textTransform: 'none', fontWeight: 400, alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={form.accept_terms}
                onChange={(e) => setForm({ ...form, accept_terms: e.target.checked })} />
              <span className="small">Я принимаю <Link to="/terms">Соглашение пользователя</Link>.</span>
            </label>
            <label className="row" style={{ gap: 8, textTransform: 'none', fontWeight: 400, alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={form.consent_ai_processing}
                onChange={(e) => setForm({ ...form, consent_ai_processing: e.target.checked })} />
              <span className="small">Разрешаю использовать мои данные в AI-функциях Светланы, когда это необходимо для выбранной функции.</span>
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Создаём аккаунт…' : 'Создать аккаунт'}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
