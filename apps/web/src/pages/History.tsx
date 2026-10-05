import { addDays, type Nutrients } from '@mea/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToday } from '../api/hooks';
import { BarChart, LineChart } from '../components/charts';
import { api } from '../lib/api';
import { fmt, prettyDate } from '../lib/format';

interface HistoryDay extends Nutrients {
  date: string;
  entries: number;
  hoursFasted: number | null;
  fastingGoalMet: boolean | null;
  outsideWindow: number;
}
interface HistoryResponse {
  from: string;
  to: string;
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number; fastingGoalHours: number };
  days: HistoryDay[];
}

type Mode = 'week' | '30' | '90';

/** Monday of the week containing `date` (Australian weeks start on Monday). */
function mondayOf(date: string) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function History() {
  const today = useToday();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('week');
  const [weekStart, setWeekStart] = useState<string | null>(null);

  const monday = weekStart ?? (today ? mondayOf(today) : null);
  const from = mode === 'week' ? monday : today ? addDays(today, -(Number(mode) - 1)) : null;
  const to = mode === 'week' ? (monday ? addDays(monday, 6) : null) : today;

  const { data, isFetching, isError } = useQuery({
    queryKey: ['history', from, to],
    queryFn: () => api.get<HistoryResponse>(`/history?from=${from}&to=${to}`),
    enabled: !!from && !!to,
    placeholderData: keepPreviousData,
  });

  if (!today || !from || !to) return <div className="spinner" />;
  const t = data?.targets;
  const logged = data?.days.filter((d) => d.entries > 0) ?? [];
  const pastOrToday = data?.days.filter((d) => d.date <= today) ?? [];

  return (
    <div className="stack">
      <h1>History</h1>

      <div className="segmented" role="group" aria-label="Range">
        {(
          [
            ['week', 'Week'],
            ['30', '30 days'],
            ['90', '90 days'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'week' && (
        <div className="row between">
          <button className="btn btn-ghost btn-icon" aria-label="Previous week" onClick={() => setWeekStart(addDays(monday!, -7))}>
            ‹
          </button>
          <strong>
            {new Date(`${from}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })} –{' '}
            {new Date(`${to}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
          </strong>
          <button className="btn btn-ghost btn-icon" aria-label="Next week" disabled={addDays(monday!, 7) > today} onClick={() => setWeekStart(addDays(monday!, 7))}>
            ›
          </button>
        </div>
      )}

      {isError && !data && <div className="banner error">Couldn't load history. You might be offline.</div>}

      {data && t && (
        <div className="stack" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <section className="card stat-grid">
            <div>
              <div className="num">{fmt(avg(logged.map((d) => d.energyKcal)))}</div>
              <div className="small muted">avg kcal / day</div>
            </div>
            <div>
              <div className="num">
                {logged.filter((d) => (d.energyKcal ?? 0) <= t.kcal).length}/{logged.length}
              </div>
              <div className="small muted">days on target</div>
            </div>
            <div>
              <div className="num">{fmt(avg(logged.map((d) => d.proteinG)))} g</div>
              <div className="small muted">avg protein</div>
            </div>
          </section>

          {mode === 'week' ? (
            <section className="card stack">
              <h2>Energy by day (kcal)</h2>
              <BarChart
                data={data.days.map((d) => ({ date: d.date, value: d.entries ? d.energyKcal : null, over: (d.energyKcal ?? 0) > t.kcal }))}
                target={t.kcal}
                unit="kcal"
                label={`Energy per day this week against a ${t.kcal} kcal target`}
              />
              <MacroAverages days={logged} t={t} />
            </section>
          ) : (
            <>
              <section className="card stack">
                <h2>Energy (kcal)</h2>
                <LineChart points={pastOrToday.map((d) => ({ date: d.date, value: d.entries ? d.energyKcal : null }))} target={t.kcal} unit="kcal" color="var(--accent)" label="Energy per day with 7-day average and target" />
              </section>
              {(
                [
                  ['Protein', 'proteinG', t.proteinG, 'var(--protein)'],
                  ['Carbs', 'carbsG', t.carbsG, 'var(--carbs)'],
                  ['Fat', 'fatG', t.fatG, 'var(--fat)'],
                ] as const
              ).map(([name, key, target, color]) => (
                <section key={key} className="card stack">
                  <h2>{name} (g)</h2>
                  <LineChart points={pastOrToday.map((d) => ({ date: d.date, value: d.entries ? d[key] : null }))} target={target} unit="g" color={color} height={130} label={`${name} per day with 7-day average and target`} />
                </section>
              ))}
              <section className="card stack">
                <h2>Hours fasted</h2>
                <LineChart points={pastOrToday.map((d) => ({ date: d.date, value: d.hoursFasted }))} target={t.fastingGoalHours} unit="h" color="var(--text)" height={130} decimals={1} label="Hours fasted per day with goal" />
              </section>
            </>
          )}

          <section className="card">
            <details className="table-toggle" open={mode === 'week'}>
              <summary>Daily numbers (tap a day to open it)</summary>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>kcal</th>
                    <th>P</th>
                    <th>C</th>
                    <th>F</th>
                    <th>Fast</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pastOrToday].reverse().map((d) => (
                    <tr key={d.date} data-link onClick={() => navigate(d.date === today ? '/' : `/?date=${d.date}`)}>
                      <td>{prettyDate(d.date, today)}</td>
                      <td className={(d.energyKcal ?? 0) > t.kcal ? 'over' : ''}>{d.entries ? `${fmt(d.energyKcal)}${(d.energyKcal ?? 0) > t.kcal ? ' ▲' : ''}` : '–'}</td>
                      <td>{d.entries ? fmt(d.proteinG) : '–'}</td>
                      <td className={(d.carbsG ?? 0) > t.carbsG ? 'over' : ''}>{d.entries ? fmt(d.carbsG) : '–'}</td>
                      <td className={(d.fatG ?? 0) > t.fatG ? 'over' : ''}>{d.entries ? fmt(d.fatG) : '–'}</td>
                      <td>{d.hoursFasted == null ? '–' : `${fmt(d.hoursFasted, 1)}h`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="small faint" style={{ marginTop: 6 }}>
                ▲ over target. Past days are compared with your current targets.
              </div>
            </details>
          </section>

          <section className="card stack">
            <h2>Export</h2>
            <div className="small muted">
              CSV files for {mode === 'week' ? 'this week' : `the last ${mode} days`}. Opens in Excel, Numbers or Google Sheets.
            </div>
            <div className="grid-2">
              <a className="btn" href={`/api/export/entries.csv?from=${from}&to=${to}`} download>
                Every entry
              </a>
              <a className="btn" href={`/api/export/daily.csv?from=${from}&to=${to}`} download>
                Daily totals
              </a>
            </div>
            <ExportAll today={today} />
          </section>
        </div>
      )}
    </div>
  );
}

function MacroAverages({ days, t }: { days: HistoryDay[]; t: HistoryResponse['targets'] }) {
  const rows = [
    ['Protein', avg(days.map((d) => d.proteinG)), t.proteinG, 'bg-p'],
    ['Carbs', avg(days.map((d) => d.carbsG)), t.carbsG, 'bg-c'],
    ['Fat', avg(days.map((d) => d.fatG)), t.fatG, 'bg-f'],
  ] as const;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="small muted">Daily average on days you logged</div>
      {rows.map(([name, value, target, cls]) => {
        const pct = value == null || !target ? 0 : Math.min(100, (value / target) * 100);
        const over = value != null && value > target;
        return (
          <div key={name}>
            <div className="row between small">
              <span className="macro-item">
                <i className={`dot ${cls}`} aria-hidden />
                {name}
              </span>
              <span className="num">
                {fmt(value)} / {fmt(target)} g{over && name !== 'Protein' ? <span style={{ color: 'var(--danger)' }}> ▲ over</span> : ''}
              </span>
            </div>
            <div className="macro-bar" style={{ marginTop: 4 }} aria-hidden>
              <i className={over && name !== 'Protein' ? '' : cls} style={{ width: `${pct}%`, background: over && name !== 'Protein' ? 'var(--critical)' : undefined }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExportAll({ today }: { today: string }) {
  const from = addDays(today, -364);
  return (
    <a className="btn btn-ghost btn-block small" href={`/api/export/entries.csv?from=${from}&to=${today}`} download>
      Download the last 12 months of entries
    </a>
  );
}
