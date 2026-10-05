import { kcalToKj, type SettingsDto } from '@mea/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { keys, useMe } from '../api/hooks';
import { NumberInput } from '../components/NumberInput';
import { FoodImport, useFoodStats } from '../components/FoodImport';
import { PushControls } from '../components/PushControls';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { fmt } from '../lib/format';

type TargetForm = Pick<
  SettingsDto,
  | 'kcalTarget'
  | 'proteinGTarget'
  | 'carbsGTarget'
  | 'fatGTarget'
  | 'closeAlertPct'
  | 'proteinNudgeTime'
  | 'proteinNudgePct'
  | 'timezone'
  | 'windowStart'
  | 'windowEnd'
  | 'windowCloseWarningMin'
  | 'fastingGoalHours'
  | 'notifyWindowOpen'
  | 'notifyWindowClosing'
  | 'notifyWindowClosed'
  | 'notifyProtein'
  | 'notifyTargets'
>;
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
      setForm({ ...me.settings });
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
    const range = (v: number | null, lo: number, hi: number) => v != null && v >= lo && v <= hi;
    const problems = [
      !range(form.kcalTarget, 500, 10000) && 'Energy target must be 500–10,000 kcal',
      !range(form.closeAlertPct, 50, 100) && '"Getting close" must be 50–100%',
      !range(form.proteinNudgePct, 0, 100) && 'Protein nudge must be 0–100%',
      !range(form.windowCloseWarningMin, 0, 240) && '"Closing soon" warning must be 0–240 minutes',
      !range(form.fastingGoalHours, 0, 72) && 'Fasting goal must be 0–72 hours',
      form.windowStart >= form.windowEnd && 'The eating window must close after it opens (same day)',
    ].filter(Boolean);
    if (problems.length) return setError(problems.join('. ') + '.');
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
        windowCloseWarningMin: round(form.windowCloseWarningMin),
        fastingGoalHours: form.fastingGoalHours,
      });
      await Promise.all([qc.invalidateQueries({ queryKey: keys.me }), qc.invalidateQueries({ queryKey: ['fasting'] }), qc.invalidateQueries({ queryKey: ['log'] })]);
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
          <h2>Eating window</h2>
          <div className="grid-2">
            <label className="field">
              <span>Opens</span>
              <input className="input" type="time" required value={form.windowStart} onChange={(e) => set('windowStart')(e.target.value)} />
            </label>
            <label className="field">
              <span>Closes</span>
              <input className="input" type="time" required value={form.windowEnd} onChange={(e) => set('windowEnd')(e.target.value)} />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>"Closing soon" warning (min before)</span>
              <NumberInput value={form.windowCloseWarningMin} onChange={set('windowCloseWarningMin')} />
            </label>
            <label className="field">
              <span>Fasting goal (hours)</span>
              <NumberInput value={form.fastingGoalHours} onChange={set('fastingGoalHours')} />
            </label>
          </div>
          <div className="small muted">Change the window for a single day on the Fasting screen (tap the FASTING/EATING card on Today).</div>
        </section>

        <section className="card stack">
          <h2>Notifications</h2>
          <PushControls />
          {(
            [
              ['notifyWindowOpen', 'Eating window opens'],
              ['notifyWindowClosing', `Window closing soon (${form.windowCloseWarningMin ?? 30} min before)`],
              ['notifyWindowClosed', 'Eating window closed'],
              ['notifyProtein', 'Protein nudge'],
              ['notifyTargets', 'Getting close / over targets'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="switch">
              <span>{label}</span>
              <input type="checkbox" checked={form[key]} onChange={(e) => set(key)(e.target.checked)} />
            </label>
          ))}
          <div className="small muted">Choose which ones you get, then tap Save settings.</div>
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

      <FoodDatabase />

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

function FoodDatabase() {
  const { data: stats } = useFoodStats();
  const [open, setOpen] = useState(false);
  const afcd = stats?.bySource.find((s) => s.code === 'afcd');
  return (
    <section className="card stack">
      <h2>Food database</h2>
      {stats && (
        <div className="small muted">
          {afcd?.count ? `${fmt(afcd.count)} AFCD foods (${afcd.version ?? 'unknown release'}).` : 'No AFCD foods loaded yet.'}
          {stats.lastImport && ` Last import ${new Date(stats.lastImport.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
        </div>
      )}
      {open ? (
        <FoodImport />
      ) : (
        <button type="button" className="btn btn-block" onClick={() => setOpen(true)}>
          {afcd?.count ? 'Upload a newer AFCD file' : 'Upload the AFCD file'}
        </button>
      )}
    </section>
  );
}
