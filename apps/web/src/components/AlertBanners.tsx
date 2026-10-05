import { computeAlerts, type DayAlert, type Nutrients, type SettingsDto } from '@mea/shared';
import { useEffect, useState } from 'react';

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

export function AlertBanners({ totals, settings, date, onSuggest }: { totals: Nutrients; settings: SettingsDto; date: string; onSuggest?: () => void }) {
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
            {a.kind === 'protein_nudge' && onSuggest && (
              <button className="btn btn-block" style={{ marginTop: 8, minHeight: 44 }} onClick={onSuggest}>
                What can I eat?
              </button>
            )}
          </div>
          <button className="btn btn-ghost btn-icon alert-close" aria-label={`Dismiss "${a.title}" for today`} onClick={() => dismiss(a.kind)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
