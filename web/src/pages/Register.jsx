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
    consent: false,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError('Нужно согласие на обработку данных — это требование закона.');
      return;
    }
    setBusy(true);
    try {
      await register({
        display_name: form.display_name,
        email: form.email,
        password: form.password,
        role: form.role,
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
          <div className="field">
            <label className="row" style={{ gap: 8, textTransform: 'none', fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
              <span className="small">Я согласен на обработку персональных данных и использование AI.</span>
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
