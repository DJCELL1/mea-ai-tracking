import { addDays, MEALS, type LogEntryDto, type Meal } from '@mea/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDayLog, useInvalidate, useToday } from '../api/hooks';
import { AmountSheet } from '../components/AmountSheet';
import { MacroLine } from '../components/MacroLine';
import { QuickAddForm } from '../components/QuickAddForm';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { amountLabel, fmt, g, MEAL_LABELS, prettyDate } from '../lib/format';

export function Today() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today;
  const { data: day, isLoading, isError } = useDayLog(date);
  const [editing, setEditing] = useState<LogEntryDto | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  if (!date || !today) return <div className="spinner" />;
  const go = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  return (
    <>
      <header className="row between">
        <button className="btn btn-ghost btn-icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
          ‹
        </button>
        <button className="btn btn-ghost" onClick={() => go(today)} aria-label="Go to today">
          <h1 style={{ margin: 0 }}>{prettyDate(date, today)}</h1>
        </button>
        <button className="btn btn-ghost btn-icon" aria-label="Next day" onClick={() => go(addDays(date, 1))}>
          ›
        </button>
      </header>

      {isError && !day && <div className="banner error">Couldn't load this day. You might be offline.</div>}
      {isLoading && <div className="spinner" />}

      {day && (
        <>
          <section className="card stack" aria-label="Day totals">
            <div className="row between">
              <div>
                <div className="kcal-big num">{fmt(day.totals.energyKcal ?? 0)}</div>
                <div className="muted small">kcal eaten</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                  {fmt(day.totals.energyKj ?? 0)}
                </div>
                <div className="muted small">kJ</div>
              </div>
            </div>
            <div className="grid-3">
              {(
                [
                  ['Protein', day.totals.proteinG, 'p'],
                  ['Carbs', day.totals.carbsG, 'c'],
                  ['Fat', day.totals.fatG, 'f'],
                ] as const
              ).map(([label, v, cls]) => (
                <div key={label}>
                  <div className="small muted">{label}</div>
                  <div className={`num ${cls}`} style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                    {g(v ?? 0)}
                  </div>
                </div>
              ))}
            </div>
            <div className="small faint">Targets and progress rings arrive in phase 3.</div>
          </section>

          {MEALS.map((meal) => (
            <MealSection key={meal} meal={meal} date={date} entries={day.entries.filter((e) => e.meal === meal)} kcal={day.byMeal[meal].energyKcal} onEdit={setEditing} />
          ))}

          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn btn-block" onClick={() => setCopyOpen(true)}>
              Copy another day…
            </button>
          </div>
        </>
      )}

      <AmountSheet open={!!editing && editing.entryType !== 'quick_add'} onClose={() => setEditing(null)} date={date} entry={editing ?? undefined} />
      <Sheet open={!!editing && editing.entryType === 'quick_add'} onClose={() => setEditing(null)} label="Edit quick add">
        {editing && <QuickAddForm date={date} meal={editing.meal} entry={editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <CopyDaySheet open={copyOpen} onClose={() => setCopyOpen(false)} toDate={date} today={today} />
    </>
  );
}

function MealSection({ meal, date, entries, kcal, onEdit }: { meal: Meal; date: string; entries: LogEntryDto[]; kcal: number | null; onEdit: (e: LogEntryDto) => void }) {
  return (
    <section>
      <div className="section-title">
        <h2>
          {MEAL_LABELS[meal]} {kcal != null && <span className="muted small num">· {fmt(kcal)} kcal</span>}
        </h2>
        <Link className="btn btn-ghost" to={`/add?meal=${meal}&date=${date}`} aria-label={`Add to ${MEAL_LABELS[meal]}`}>
          ＋ Add
        </Link>
      </div>
      {entries.length > 0 && (
        <ul className="list card" style={{ padding: '0 12px' }}>
          {entries.map((e) => (
            <li key={e.id}>
              <button className="list-item" onClick={() => onEdit(e)}>
                <div className="grow">
                  <div className="ellipsis">{e.name}</div>
                  <div className="small faint">
                    {[amountLabel(e), e.entryType === 'quick_add' ? 'Quick add' : ''].filter(Boolean).join(' · ')}
                    {(amountLabel(e) || e.entryType === 'quick_add') && (e.proteinG != null || e.carbsG != null || e.fatG != null) && ' · '}
                    <MacroLine n={e} className="" />
                  </div>
                </div>
                <div className="num" style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>{fmt(e.energyKcal)}</div>
                  <div className="small faint">kcal</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CopyDaySheet({ open, onClose, toDate, today }: { open: boolean; onClose: () => void; toDate: string; today: string }) {
  const [fromDate, setFromDate] = useState(addDays(toDate, -1));
  // Default to the day before whichever day the sheet is opened on
  useEffect(() => {
    if (open) setFromDate(addDays(toDate, -1));
  }, [open, toDate]);
  const { data: source } = useDayLog(open ? fromDate : undefined);
  const inv = useInvalidate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(meals?: Meal[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ copied: number }>('/log/copy', { fromDate, toDate, meals });
      await inv.log();
      toast(`Copied ${res.copied} ${res.copied === 1 ? 'entry' : 'entries'}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Copy another day">
      <div className="stack">
        <h2>Copy to {prettyDate(toDate, today).toLowerCase()}</h2>
        <label className="field">
          <span>From</span>
          <input className="input" type="date" value={fromDate} max={today} onChange={(e) => e.target.value && setFromDate(e.target.value)} />
        </label>
        {source && (
          <div className="small muted">
            {source.entries.length} entries · {fmt(source.totals.energyKcal ?? 0)} kcal
          </div>
        )}
        {error && <div className="banner error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !source?.entries.length} onClick={() => copy()}>
          Copy whole day
        </button>
        <div className="grid-2">
          {MEALS.filter((m) => source?.entries.some((e) => e.meal === m)).map((m) => (
            <button key={m} className="btn" disabled={busy} onClick={() => copy([m])}>
              {MEAL_LABELS[m]} only
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
