import { kcalToKj, type SettingsDto } from '@mea/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { keys, useMe } from '../api/hooks';
import { NumberInput } from '../components/NumberInput';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { fmt } from '../lib/format';

type TargetForm = Pick<SettingsDto, 'kcalTarget' | 'proteinGTarget' | 'carbsGTarget' | 'fatGTarget' | 'closeAlertPct' | 'proteinNudgeTime' | 'proteinNudgePct' | 'timezone'>;
type Nullable<T> = { [K in keyof T]: T[K] extends number ? number | null : T[K] };

const AU_ZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Perth',
  'Australia/Hobart',
  'Pacific/Auckland',
];

export function Settings() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Nullable<TargetForm> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me && !form) {
      const { kcalTarget, proteinGTarget, carbsGTarget, fatGTarget, closeAlertPct, proteinNudgeTime, proteinNudgePct, timezone } = me.settings;
      setForm({ kcalTarget, proteinGTarget, carbsGTarget, fatGTarget, closeAlertPct, proteinNudgeTime, proteinNudgePct, timezone });
    }
  }, [me, form]);

  if (!me || !form) return <div className="spinner" />;
  const set = <K extends keyof TargetForm>(k: K) => (v: Nullable<TargetForm>[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const macroKcal = (form.proteinGTarget ?? 0) * 4 + (form.carbsGTarget ?? 0) * 4 + (form.fatGTarget ?? 0) * 9;
  const diff = form.kcalTarget ? macroKcal - form.kcalTarget : 0;
  const zones = AU_ZONES.includes(form.timezone) ? AU_ZONES : [form.timezone, ...AU_ZONES];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const missing = (Object.entries(form) as [string, unknown][]).filter(([, v]) => v == null || v === '');
    if (missing.length) return setError('Fill in every field');
    setBusy(true);
    setError(null);
    try {
      const round = (n: number | null) => Math.round(n ?? 0);
      await api.put('/settings', {
        ...form,
        kcalTarget: round(form.kcalTarget),
        proteinGTarget: round(form.proteinGTarget),
        carbsGTarget: round(form.carbsGTarget),
        fatGTarget: round(form.fatGTarget),
        closeAlertPct: round(form.closeAlertPct),
        proteinNudgePct: round(form.proteinNudgePct),
      });
      await qc.invalidateQueries({ queryKey: keys.me });
      toast('Settings saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    qc.clear();
    if ('caches' in window) await caches.delete('api-data').catch(() => {});
    location.href = '/';
  }

  return (
    <div className="stack">
      <h1>Settings</h1>

      <form className="stack" onSubmit={save}>
        <section className="card stack">
          <h2>Daily targets</h2>
          <label className="field">
            <span>Energy (kcal){form.kcalTarget ? ` = ${fmt(kcalToKj(form.kcalTarget))} kJ` : ''}</span>
            <NumberInput value={form.kcalTarget} onChange={set('kcalTarget')} />
          </label>
          <div className="grid-3">
            <label className="field">
              <span className="macro-item">
                <i className="dot bg-p" aria-hidden />
                Protein g
              </span>
              <NumberInput value={form.proteinGTarget} onChange={set('proteinGTarget')} />
            </label>
            <label className="field">
              <span className="macro-item">
                <i className="dot bg-c" aria-hidden />
                Carbs g
              </span>
              <NumberInput value={form.carbsGTarget} onChange={set('carbsGTarget')} />
            </label>
            <label className="field">
              <span className="macro-item">
                <i className="dot bg-f" aria-hidden />
                Fat g
              </span>
              <NumberInput value={form.fatGTarget} onChange={set('fatGTarget')} />
            </label>
          </div>
          <div className="small muted num">
            Your macros add up to {fmt(macroKcal)} kcal ({fmt(kcalToKj(macroKcal))} kJ)
            {form.kcalTarget && Math.abs(diff) > 50 ? `, ${fmt(Math.abs(diff))} kcal ${diff > 0 ? 'above' : 'below'} your energy target.` : '.'}
          </div>
        </section>

        <section className="card stack">
          <h2>Alerts</h2>
          <label className="field">
            <span>"Getting close" warning at (% of energy target)</span>
            <NumberInput value={form.closeAlertPct} onChange={set('closeAlertPct')} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Protein check time</span>
              <input className="input" type="time" required value={form.proteinNudgeTime} onChange={(e) => set('proteinNudgeTime')(e.target.value)} />
            </label>
            <label className="field">
              <span>Nudge if below (% of protein)</span>
              <NumberInput value={form.proteinNudgePct} onChange={set('proteinNudgePct')} />
            </label>
          </div>
          <div className="small muted">
            Going over any target is always flagged. The protein nudge suggests high-protein foods you often eat.
          </div>
        </section>

        <section className="card stack">
          <h2>Day</h2>
          <label className="field">
            <span>Timezone (when your day starts and ends)</span>
            <select className="input" value={form.timezone} onChange={(e) => set('timezone')(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && <div className="banner error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          Save settings
        </button>
      </form>

      <div className="banner small muted">Your eating window and notifications will be set here (phases 4–5).</div>

      <section className="card stack small muted">
        <strong style={{ color: 'var(--text)' }}>Install on your phone</strong>
        <div>iPhone: open in Safari, tap Share, then "Add to Home Screen".</div>
        <div>Android: open in Chrome, tap ⋮, then "Install app".</div>
        <div>Logged in as {me.email}</div>
      </section>
      <button className="btn btn-block btn-danger" onClick={logout}>
        Log out
      </button>
    </div>
  );
}
