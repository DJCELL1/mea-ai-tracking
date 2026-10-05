import { computeAlerts, type DayAlert, type Nutrients, type SettingsDto } from '@mea/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmt, mealForTime } from '../lib/format';
import { AmountSheet } from './AmountSheet';
import type { FoodDto } from '@mea/shared';

interface ProteinSuggestion {
  food: FoodDto;
  grams: number;
  servingId: number | null;
  servingQty: number | null;
  proteinG: number;
  energyKcal: number;
  fromHistory: boolean;
}

const ICON: Record<DayAlert['level'], string> = { info: 'ℹ', warning: '⚠', critical: '⛔' };

/** Re-render every minute so time-based alerts (protein nudge) appear on their own. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const dismissKey = (date: string, kind: string) => `mea:dismissed:${date}:${kind}`;
function isDismissed(date: string, kind: string) {
  try {
    return localStorage.getItem(dismissKey(date, kind)) === '1';
  } catch {
    return false;
  }
}

export function AlertBanners({ totals, settings, date }: { totals: Nutrients; settings: SettingsDto; date: string }) {
  const now = useNow();
  const [, force] = useState(0);
  const alerts = computeAlerts(totals, settings, date, now).filter((a) => !isDismissed(date, a.kind));
  if (!alerts.length) return null;

  const dismiss = (kind: string) => {
    try {
      localStorage.setItem(dismissKey(date, kind), '1');
    } catch {
      /* private mode: just hide until reload */
    }
    force((n) => n + 1);
  };

  return (
    <div className="stack" style={{ gap: 8, marginBottom: 12 }} aria-live="polite">
      {alerts.map((a) => (
        <div key={a.kind} className={`alert ${a.level}`} role={a.level === 'critical' ? 'alert' : 'status'}>
          <span className="alert-icon" aria-hidden>
            {ICON[a.level]}
          </span>
          <div className="grow">
            <strong>{a.title}</strong>
            <div className="small muted">{a.message}</div>
            {a.kind === 'protein_nudge' && <ProteinSuggestions date={date} />}
          </div>
          <button className="btn btn-ghost btn-icon alert-close" aria-label={`Dismiss "${a.title}" for today`} onClick={() => dismiss(a.kind)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function ProteinSuggestions({ date }: { date: string }) {
  const { data } = useQuery({ queryKey: ['suggestions', 'protein'], queryFn: () => api.get<ProteinSuggestion[]>('/suggestions/protein?limit=3'), staleTime: 5 * 60_000 });
  const [picked, setPicked] = useState<ProteinSuggestion | null>(null);
  if (!data?.length) return null;
  return (
    <>
      <div className="small" style={{ marginTop: 8 }}>
        {data.some((s) => s.fromHistory) ? 'Foods you often eat that are high in protein:' : 'High-protein ideas (tap to add):'}
      </div>
      <ul className="list">
        {data.map((s) => (
          <li key={s.food.id}>
            <button className="list-item" style={{ minHeight: 44, padding: '4px 0' }} onClick={() => setPicked(s)} aria-label={`Add ${fmt(s.grams)} g ${s.food.name}, ${fmt(s.proteinG)} g protein`}>
              <span className="grow ellipsis small">{s.food.name}</span>
              <span className="small muted num" style={{ flex: 'none' }}>
                {fmt(s.grams)} g · {fmt(s.proteinG)} g P
              </span>
              <span style={{ color: 'var(--accent)', fontWeight: 700, flex: 'none' }} aria-hidden>
                ＋
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AmountSheet
        open={!!picked}
        onClose={() => setPicked(null)}
        date={date}
        food={picked?.food}
        meal={mealForTime()}
        initialAmount={picked ? { grams: picked.grams, servingId: picked.servingId, servingQty: picked.servingQty } : undefined}
      />
    </>
  );
}
