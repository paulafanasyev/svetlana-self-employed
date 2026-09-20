import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form);
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти. Проверьте email и пароль.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content" style={{ maxWidth: 460, paddingTop: 48 }}>
      <div className="card">
        <div className="row" style={{ marginBottom: 16 }}>
          <SvetlanaAvatar emotion="IDLE" size={48} />
          <div>
            <h2 style={{ margin: 0 }}>Вход</h2>
            <p className="muted small" style={{ margin: 0 }}>Рады видеть вас снова</p>
          </div>
        </div>

        {error && <div className="alert err" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input id="password" type="password" autoComplete="current-password" required
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}
