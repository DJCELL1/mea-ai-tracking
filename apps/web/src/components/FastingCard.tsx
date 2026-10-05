import { formatDuration } from '@mea/shared';
import { Link } from 'react-router-dom';
import { useFastingNow, useMe } from '../api/hooks';
import { clock, prettyDate } from '../lib/format';

const dayWord = (date: string | undefined, today: string) => {
  if (!date || date === today) return '';
  const p = prettyDate(date, today);
  return p === 'Tomorrow' ? ' tomorrow' : ` on ${p}`;
};

/** FASTING / EATING with a countdown to when the window opens or closes. */
export function FastingCard({ timeZone }: { timeZone: string }) {
  const f = useFastingNow();
  if (!f) return null;
  const eating = f.state === 'eating';
  const fastedFor = !eating && f.lastFoodAt ? f.now.getTime() - f.lastFoodAt.getTime() : null;

  return (
    <Link to="/fasting" className="card fast-card" aria-label={`${eating ? 'Eating' : 'Fasting'}. Open fasting details`}>
      <div className={`fast-icon ${f.state}`} aria-hidden>
        {eating ? '🍽' : '⏳'}
      </div>
      <div className="grow">
        <div className={`fast-state ${f.state}`}>{eating ? 'EATING' : 'FASTING'}</div>
        {f.changesAt ? (
          <div className="countdown num">
            {eating ? 'Closes' : 'Opens'} in {formatDuration(f.msLeft!)}
            <span className="small muted" style={{ fontWeight: 400 }}>
              {' '}
              · {clock(f.changesAt, timeZone)}
              {dayWord(f.window?.date, f.overview.today)}
            </span>
          </div>
        ) : (
          <div className="small muted">No eating window in the next week</div>
        )}
        {fastedFor != null && <div className="small muted num">Fasted {formatDuration(fastedFor)} so far</div>}
        {f.closingSoon && <span className="status-tag warning">⚠ Window closing soon</span>}
      </div>
      <span className="faint" aria-hidden>
        ›
      </span>
    </Link>
  );
}

/** Inline warning shown when logging food for today while the window is closed. */
export function OutsideWindowNotice({ date }: { date: string }) {
  const f = useFastingNow();
  const { data: me } = useMe();
  if (!f || !me || f.state === 'eating' || date !== f.overview.today) return null;
  const opens = f.changesAt ? ` It opens at ${clock(f.changesAt, me.settings.timezone)}${dayWord(f.window?.date, f.overview.today)}.` : '';
  return (
    <div className="alert warning small" role="status">
      <span className="alert-icon" aria-hidden>
        ⚠
      </span>
      <div>
        You're outside your eating window.{opens} You can still log it.
      </div>
    </div>
  );
}
