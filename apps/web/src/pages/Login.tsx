import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { keys } from '../api/hooks';
import { api, errorMessage } from '../lib/api';

export function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      await qc.invalidateQueries({ queryKey: keys.me });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app" style={{ display: 'grid', alignContent: 'center', paddingBottom: 48 }}>
      <form className="card stack" onSubmit={submit}>
        <div className="row">
          <img src="/icons/favicon.svg" alt="" width={40} height={40} />
          <h1 style={{ margin: 0 }}>Mea</h1>
        </div>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="banner error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
