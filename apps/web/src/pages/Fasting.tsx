import { formatDuration, type FastingDay } from '@mea/shared';
import { useState } from 'react';
import { useFasting, useFastingHistory, useInvalidate, useMe, type FastingOverview } from '../api/hooks';
import { FastingCard } from '../components/FastingCard';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { clock, fmt, hhmmLabel, prettyDate } from '../lib/format';
import { useQueryClient } from '@tanstack/react-query';

type Win = FastingOverview['windows'][number];

export function Fasting() {
  const { data: me } = useMe();
  const { data: overview } = useFasting();
  const [days, setDays] = useState(14);
  const { data: history } = useFastingHistory(days);
  const [editing, setEditing] = useState<Win | null>(null);

  if (!me || !overview) return <div className="spinner" />;
  const tz = me.settings.timezone;

  return (
    <div className="stack">
      <h1>Fasting</h1>
      <FastingCard timeZone={tz} />

      <section>
        <div className="section-title">
          <h2>Eating window</h2>
          <span className="small muted">
            Default {hhmmLabel(overview.defaults.windowStart)}–{hhmmLabel(overview.defaults.windowEnd)}
          </span>
        </div>
        <ul className="list card" style={{ padding: '0 12px' }}>
          {overview.windows.map((w) => (
            <li key={w.date}>
              <button className="list-item" onClick={() => setEditing(w)} aria-label={`Change the eating window for ${prettyDate(w.date, overview.today)}`}>
                <div className="grow">
                  <div>{prettyDate(w.date, overview.today)}</div>
                  <div className="small muted num">
                    {w.isFastDay ? 'Fast day: no eating window' : `${clock(new Date(w.start), tz)} – ${clock(new Date(w.end), tz)}`}
                    {w.isOverride && <span style={{ color: 'var(--accent)' }}> · just this day</span>}
                  </div>
                </div>
                <span className="faint">Edit ›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="section-title">
          <h2>History</h2>
          <div className="segmented" style={{ width: 180 }}>
            {[14, 30].map((n) => (
              <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
                {n} days
              </button>
            ))}
          </div>
        </div>
        {history && (
          <div className="stack">
            <div className="card stat-grid">
              <div>
                <div className="num">{history.currentStreak}</div>
                <div className="small muted">day streak</div>
              </div>
              <div>
                <div className="num">{history.longestStreak}</div>
                <div className="small muted">longest</div>
              </div>
              <div>
                <div className="num">{history.averageHours == null ? '–' : `${fmt(history.averageHours, 1)} h`}</div>
                <div className="small muted">average fast</div>
              </div>
            </div>
            <div className="small muted">
              Goal: {fmt(history.goalHours, 1)} h fasted between your last food and your first food the next day. Change it in Settings.
            </div>
            <ul className="list card" style={{ padding: '4px 12px' }} aria-label="Hours fasted per day">
              {[...history.days].reverse().map((d) => (
                <HistoryRow key={d.date} d={d} goal={history.goalHours} today={overview.today} tz={tz} />
              ))}
            </ul>
          </div>
        )}
      </section>

      <WindowSheet win={editing} onClose={() => setEditing(null)} today={overview.today} defaults={overview.defaults} />
    </div>
  );
}

function HistoryRow({ d, goal, today, tz }: { d: FastingDay; goal: number; today: string; tz: string }) {
  const MAX = 24;
  const pct = d.hoursFasted == null ? 0 : Math.min(100, (d.hoursFasted / MAX) * 100);
  const label = d.untracked
    ? 'Before you started logging'
    : d.noFood && !d.ongoing
      ? 'No food logged (fasted)'
      : d.hoursFasted == null
        ? 'First logged day'
        : `${fmt(d.hoursFasted, 1)} h${d.ongoing ? ' so far' : ''}`;
  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="row between small">
        <span>{prettyDate(d.date, today)}</span>
        <span className="num">
          {label}
          {d.hoursFasted != null && !d.ongoing && (d.metGoal ? <span style={{ color: 'var(--accent)' }}> ✓ goal</span> : <span className="muted"> · under goal</span>)}
        </span>
      </div>
      <div className="hbar" style={{ marginTop: 6 }} aria-hidden>
        <i style={{ width: `${d.noFood && !d.ongoing && !d.untracked ? 100 : pct}%`, background: d.metGoal ? 'var(--accent)' : 'var(--muted)', opacity: d.ongoing ? 0.6 : 1 }} />
        <span className="goal" style={{ left: `${(goal / MAX) * 100}%` }} />
      </div>
      {d.firstFoodAt && d.fastStartAt && (
        <div className="small faint num" style={{ marginTop: 4 }}>
          {clock(new Date(d.fastStartAt), tz)} → {clock(new Date(d.firstFoodAt), tz)}
        </div>
      )}
    </li>
  );
}

function WindowSheet({ win, onClose, today, defaults }: { win: Win | null; onClose: () => void; today: string; defaults: FastingOverview['defaults'] }) {
  const qc = useQueryClient();
  const inv = useInvalidate();
  const toast = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Reset the form each time a different day is opened
  if (win && lastKey !== win.date) {
    setLastKey(win.date);
    setStart(win.isFastDay ? defaults.windowStart : win.startTime);
    setEnd(win.isFastDay ? defaults.windowEnd : win.endTime);
    setError(null);
  }
  if (!win && lastKey) setLastKey(null);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const overview = await fn();
      qc.setQueryData(['fasting'], overview);
      await inv.log();
      toast(msg);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const label = win ? prettyDate(win.date, today) : '';
  return (
    <Sheet open={!!win} onClose={onClose} label={`Eating window for ${label}`}>
      {win && (
        <div className="stack">
          <h2>Eating window · {label}</h2>
          <div className="grid-2">
            <label className="field">
              <span>Opens</span>
              <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>Closes</span>
              <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          {error && <div className="banner error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy || !start || !end} onClick={() => run(() => api.put(`/fasting/overrides/${win.date}`, { startTime: start, endTime: end }), 'Window updated for that day')}>
            Save for {label.toLowerCase() === 'today' || label.toLowerCase() === 'tomorrow' ? label.toLowerCase() : label}
          </button>
          <button className="btn btn-block" disabled={busy} onClick={() => run(() => api.put(`/fasting/overrides/${win.date}`, { isFastDay: true }), 'Marked as a fast day')}>
            Make it a fast day (no window)
          </button>
          {win.isOverride && (
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => run(() => api.del(`/fasting/overrides/${win.date}`).then(() => api.get('/fasting')), 'Back to your default window')}>
              Use my default ({hhmmLabel(defaults.windowStart)}–{hhmmLabel(defaults.windowEnd)})
            </button>
          )}
          <div className="small muted">Change your everyday window in Settings.</div>
        </div>
      )}
    </Sheet>
  );
}
