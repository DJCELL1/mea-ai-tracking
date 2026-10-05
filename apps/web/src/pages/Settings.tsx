import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../api/hooks';
import { api } from '../lib/api';

export function Settings() {
  const { data: me } = useMe();
  const qc = useQueryClient();

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    qc.clear();
    if ('caches' in window) await caches.delete('api-data').catch(() => {});
    location.href = '/';
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      <section className="card stack">
        <div className="row between">
          <span className="muted">Logged in as</span>
          <span>{me?.email}</span>
        </div>
        <div className="row between">
          <span className="muted">Timezone</span>
          <span>{me?.settings.timezone}</span>
        </div>
      </section>
      <div className="banner small muted">Daily targets, alerts and your eating window will be set here (phases 3–4).</div>
      <section className="card stack small muted">
        <strong style={{ color: 'var(--text)' }}>Install on your phone</strong>
        <div>iPhone: open in Safari, tap Share, then "Add to Home Screen".</div>
        <div>Android: open in Chrome, tap ⋮, then "Install app".</div>
      </section>
      <button className="btn btn-block btn-danger" onClick={logout}>
        Log out
      </button>
    </div>
  );
}
