import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';

export function Login() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // If no account exists yet, this login screen is out of date: offer setup instead
  const { data: setup } = useQuery({
    queryKey: ['setupStatus'],
    queryFn: () => api.get<{ needsAccount: boolean }>('/setup/status'),
    retry: false,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'reset' && password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      if (mode === 'login') await api.post('/auth/login', { email, password });
      else await api.post('/setup/reset-password', { code, email, password });
      await qc.invalidateQueries();
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
          <h1 style={{ margin: 0 }}>{mode === 'login' ? 'Mea' : 'Reset password'}</h1>
        </div>

        {setup?.needsAccount && (
          <div className="banner small">
            No account has been set up yet.{' '}
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => location.reload()}>
              Set up Mea
            </button>
          </div>
        )}

        {mode === 'reset' && (
          <>
            <div className="small muted">Use your setup code (the SETUP_TOKEN value on Railway) to set a new password. Other devices get logged out.</div>
            <label className="field">
              <span>Setup code</span>
              <input className="input" required autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          </>
        )}
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{mode === 'login' ? 'Password' : 'New password (10+ characters)'}</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'reset' ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'reset' && (
          <label className="field">
            <span>New password again</span>
            <input className="input" type="password" autoComplete="new-password" required minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        )}
        {error && <div className="banner error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Reset and log in'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block small"
          onClick={() => {
            setMode(mode === 'login' ? 'reset' : 'login');
            setError(null);
            setPassword('');
            setConfirm('');
          }}
        >
          {mode === 'login' ? 'Forgot password?' : 'Back to log in'}
        </button>
      </form>
    </main>
  );
}
