import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FoodImport } from '../components/FoodImport';
import { api, errorMessage } from '../lib/api';

/** Shown while no account exists: create the one login with the SETUP_TOKEN code. */
export function SetupAccount({ codeConfigured }: { codeConfigured: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.post('/setup/account', { code, email, password });
      await qc.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app" style={{ display: 'grid', alignContent: 'center', paddingBottom: 48 }}>
      <div className="card stack">
        <div className="row">
          <img src="/icons/favicon.svg" alt="" width={40} height={40} />
          <h1 style={{ margin: 0 }}>Set up Mea</h1>
        </div>
        {!codeConfigured ? (
          <div className="stack small">
            <div>
              First, add a private setup code on Railway: open your app service → <strong>Variables</strong> → <strong>New Variable</strong>, name it <code>SETUP_TOKEN</code>, give it any long value only you know, and let it redeploy.
            </div>
            <div className="muted">Then reload this page.</div>
            <button className="btn btn-block" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="small muted">Create your login. This screen disappears once your account exists.</div>
            <label className="field">
              <span>Setup code (the SETUP_TOKEN value)</span>
              <input className="input" required autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Password (10+ characters)</span>
              <input className="input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="field">
              <span>Password again</span>
              <input className="input" type="password" required minLength={10} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            {error && <div className="banner error">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Creating…' : 'Create my login'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

/** Shown after login while the food database is empty. */
export function SetupFoods({ onSkip }: { onSkip: () => void }) {
  return (
    <main className="app">
      <div className="stack">
        <h1>Load the food database</h1>
        <div className="small muted">Upload the Australian Food Composition Database (AFCD) Excel file so you can search about 1,600 foods. You can also do this later from Settings.</div>
        <section className="card">
          {/* Once foods are loaded this screen closes by itself */}
          <FoodImport />
        </section>
        <button className="btn btn-ghost btn-block" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </main>
  );
}
