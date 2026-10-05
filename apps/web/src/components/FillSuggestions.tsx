import type { FoodDto } from '@mea/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useInvalidate } from '../api/hooks';
import { api, errorMessage } from '../lib/api';
import { fmt, mealForTime } from '../lib/format';
import { AmountSheet } from './AmountSheet';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

interface FillOption {
  food: FoodDto;
  grams: number;
  servingId: number | null;
  servingQty: number | null;
  servingLabel: string | null;
  proteinG: number;
  energyKcal: number;
  energyKj: number;
  covers: number;
  fitsKcal: boolean;
  fromHistory: boolean;
}
interface FillCombo {
  items: FillOption[];
  proteinG: number;
  energyKcal: number;
  covers: number;
  fitsKcal: boolean;
}
interface FillResponse {
  date: string;
  proteinLeftG: number;
  kcalLeft: number;
  windowClosesInMin: number | null;
  windowOpen: boolean;
  options: FillOption[];
  combo: FillCombo | null;
}

const amount = (o: FillOption) => (o.servingLabel ? `${fmt(o.servingQty, 1)} × ${o.servingLabel}` : `${fmt(o.grams)} g`);

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m` : `${m} min`);

/** "What can I eat?" — portions that cover today's protein gap within the kcal left. */
export function FillSuggestionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['suggestions', 'fill'],
    queryFn: () => api.get<FillResponse>('/suggestions/fill'),
    enabled: open,
    staleTime: 0,
  });
  const [picked, setPicked] = useState<FillOption | null>(null);
  const [busy, setBusy] = useState(false);
  const inv = useInvalidate();
  const toast = useToast();

  async function addBoth(combo: FillCombo) {
    if (!data) return;
    setBusy(true);
    try {
      const meal = mealForTime();
      for (const o of combo.items) {
        await api.post('/log', { date: data.date, meal, foodId: o.food.id, ...(o.servingId ? { servingId: o.servingId, servingQty: o.servingQty } : { grams: o.grams }) });
      }
      await inv.log();
      toast(`Added both: +${fmt(combo.proteinG)} g protein`);
      onClose();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open && !picked} onClose={onClose} label="What can I eat?">
        <div className="stack">
          <h2>What can I eat?</h2>
          {isError && <div className="banner error">Couldn't load suggestions. Check your connection.</div>}
          {!data && isFetching && <div className="spinner" />}
          {data && (
            <>
              <div className="card small num" style={{ display: 'grid', gap: 4 }}>
                <div>
                  <span className="macro-item">
                    <i className="dot bg-p" aria-hidden />
                    <strong>{fmt(data.proteinLeftG)} g protein</strong>
                  </span>{' '}
                  still to go
                </div>
                <div className="muted">{data.kcalLeft > 0 ? `${fmt(data.kcalLeft)} kcal left today` : `${fmt(-data.kcalLeft)} kcal over your target already`}</div>
                {data.windowClosesInMin != null && (
                  <div style={{ color: data.windowClosesInMin <= 60 ? 'var(--warn)' : undefined }}>
                    {data.windowClosesInMin <= 60 ? '⚠ ' : ''}Eating window closes in {mins(data.windowClosesInMin)}
                  </div>
                )}
                {!data.windowOpen && <div style={{ color: 'var(--warn)' }}>⚠ Your eating window is closed; anything you log now is flagged.</div>}
              </div>

              {data.proteinLeftG <= 0 ? (
                <div className="empty">You've hit your protein target today. 🎉</div>
              ) : data.options.length === 0 ? (
                <div className="empty">No high-protein foods found yet. Log a few and they'll show up here.</div>
              ) : (
                <>
                {data.combo && (
                  <div className="card stack" style={{ gap: 8 }}>
                    <div className="small muted">No single portion covers it. Have both:</div>
                    {data.combo.items.map((o) => (
                      <div key={o.food.id} className="small">
                        <strong className="num">{amount(o)}</strong> {o.food.name} <span className="muted num">· {fmt(o.proteinG)} g protein</span>
                      </div>
                    ))}
                    <div className="small num">
                      = <strong>{fmt(data.combo.proteinG)} g protein</strong> · {fmt(data.combo.energyKcal)} kcal
                      {data.combo.covers >= 0.98 ? <span style={{ color: 'var(--accent)' }}> · ✓ covers it</span> : <span className="muted"> · covers {Math.round(data.combo.covers * 100)}%</span>}
                      {!data.combo.fitsKcal && <span style={{ color: 'var(--warn)' }}> · ⚠ over your kcal</span>}
                    </div>
                    <button className="btn btn-primary btn-block" disabled={busy} onClick={() => addBoth(data.combo!)}>
                      Add both
                    </button>
                  </div>
                )}
                <ul className="list">
                  {data.options.map((o) => (
                    <li key={o.food.id}>
                      <button className="list-item" onClick={() => setPicked(o)} aria-label={`Add ${o.servingLabel ? `${fmt(o.servingQty, 1)} × ${o.servingLabel}` : `${fmt(o.grams)} g`} ${o.food.name}`}>
                        <div className="grow">
                          <div className="ellipsis">{o.food.name}</div>
                          <div className="small muted num">
                            {o.servingLabel ? `${amount(o)} (${fmt(o.grams)} g)` : amount(o)} · <strong style={{ color: 'var(--text)' }}>{fmt(o.proteinG)} g protein</strong> · {fmt(o.energyKcal)} kcal
                          </div>
                          <div className="small">
                            {o.covers >= 0.98 ? <span style={{ color: 'var(--accent)' }}>✓ covers it</span> : <span className="muted">covers {Math.round(o.covers * 100)}%</span>}
                            {!o.fitsKcal && <span style={{ color: 'var(--warn)' }}> · ⚠ over your kcal</span>}
                            {o.fromHistory && <span className="faint"> · you eat this</span>}
                          </div>
                        </div>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }} aria-hidden>
                          ＋
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                </>
              )}
              <div className="small faint">Portions stay between half and double what you usually have. Tap one to adjust and log it.</div>
            </>
          )}
        </div>
      </Sheet>
      {data && (
        <AmountSheet
          open={!!picked}
          onClose={() => setPicked(null)}
          date={data.date}
          food={picked?.food}
          meal={mealForTime()}
          initialAmount={picked ? { grams: picked.grams, servingId: picked.servingId, servingQty: picked.servingQty } : undefined}
          onLogged={onClose}
        />
      )}
    </>
  );
}
