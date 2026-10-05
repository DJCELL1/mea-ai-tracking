import { computeAlerts, localTime, type EatingWindow, type Nutrients, type SettingsDto } from '@mea/shared';

export interface DueNotification {
  /** Dedupe key: each kind is sent at most once per day. */
  kind: string;
  title: string;
  body: string;
  url: string;
}

/** Minutes after an event during which it's still sent (covers restarts and a missed tick). */
const GRACE_MS = 15 * 60_000;
/** Don't send protein nudges late at night. */
const QUIET_FROM = '22:00';

const clock = (d: Date, tz: string) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: tz });

/**
 * What should be pushed right now. Pure: the caller dedupes with notifications_sent,
 * so returning the same kind on every tick within the grace period is fine.
 */
export function dueNotifications(
  now: Date,
  s: SettingsDto,
  today: string,
  window: EatingWindow,
  totals: Nutrients,
): DueNotification[] {
  const out: DueNotification[] = [];
  const t = now.getTime();

  if (!window.isFastDay) {
    const start = window.start.getTime();
    const end = window.end.getTime();
    const warnMs = s.windowCloseWarningMin * 60_000;
    if (s.notifyWindowOpen && t >= start && t < start + GRACE_MS) {
      out.push({ kind: 'window_open', title: 'Eating window open', body: `You can eat until ${clock(window.end, s.timezone)}.`, url: '/' });
    }
    if (s.notifyWindowClosing && warnMs > 0 && t >= end - warnMs && t < end) {
      const mins = Math.max(1, Math.round((end - t) / 60_000));
      const proteinLeft = Math.round(s.proteinGTarget - (totals.proteinG ?? 0));
      const body =
        proteinLeft >= 5
          ? `You still need ${proteinLeft} g protein before ${clock(window.end, s.timezone)}.`
          : `Last chance to eat before ${clock(window.end, s.timezone)}.`;
      out.push({ kind: 'window_closing', title: `Eating window closes in ${mins} min`, body, url: '/' });
    }
    if (s.notifyWindowClosed && t >= end && t < end + GRACE_MS) {
      out.push({ kind: 'window_closed', title: 'Eating window closed', body: 'Fasting has started. Nice work.', url: '/fasting' });
    }
  }

  for (const a of computeAlerts(totals, s, today, now)) {
    if (a.kind === 'protein_nudge') {
      if (s.notifyProtein && localTime(now, s.timezone) < QUIET_FROM) {
        out.push({ kind: a.kind, title: a.title, body: a.message, url: '/' });
      }
    } else if (a.kind !== 'protein_over' && s.notifyTargets) {
      out.push({ kind: a.kind, title: a.title, body: a.message, url: '/' });
    }
  }
  return out;
}
