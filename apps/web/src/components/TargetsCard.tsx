import { kcalToKj, progress, type Nutrients, type SettingsDto, type TargetProgress } from '@mea/shared';
import { fmt } from '../lib/format';
import { Ring } from './Ring';

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)', dot: 'bg-p' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)', dot: 'bg-c' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)', dot: 'bg-f' },
] as const;

function energyState(p: TargetProgress, closePct: number): 'ok' | 'warning' | 'critical' {
  if (p.remaining < 0) return 'critical';
  if (p.ratio * 100 >= closePct) return 'warning';
  return 'ok';
}

export function TargetsCard({ totals, settings }: { totals: Nutrients; settings: SettingsDto }) {
  const [kcal, ...macros] = progress(totals, settings);
  const state = energyState(kcal, settings.closeAlertPct);
  const ringColor = state === 'critical' ? 'var(--critical)' : state === 'warning' ? 'var(--warn)' : 'var(--accent)';
  const over = kcal.remaining < 0;

  return (
    <section className="card targets" aria-label="Daily targets">
      <div className="targets-main">
        <Ring
          ratio={kcal.ratio}
          color={ringColor}
          size={136}
          stroke={13}
          label={`Energy: ${fmt(kcal.eaten)} of ${fmt(kcal.target)} kcal, ${over ? `${fmt(-kcal.remaining)} over` : `${fmt(kcal.remaining)} left`}`}
        >
          <div className="num" style={{ fontSize: '1.7rem', fontWeight: 800 }}>
            {fmt(Math.abs(kcal.remaining))}
          </div>
          <div className="small muted">{over ? 'kcal over' : 'kcal left'}</div>
        </Ring>
        <div className="stack" style={{ gap: 4 }}>
          <div>
            <span className="num" style={{ fontSize: '1.5rem', fontWeight: 800 }}>
              {fmt(kcal.eaten)}
            </span>
            <span className="muted"> / {fmt(kcal.target)} kcal</span>
          </div>
          <div className="small muted num">
            {fmt(totals.energyKj ?? 0)} / {fmt(kcalToKj(kcal.target))} kJ
          </div>
          {state === 'warning' && <span className="status-tag warning">⚠ Getting close</span>}
          {state === 'critical' && <span className="status-tag critical">⛔ Over target</span>}
        </div>
      </div>

      <div className="targets-macros">
        {MACROS.map((m, i) => {
          const p = macros[i];
          const isOver = p.remaining < 0;
          // Going over carbs/fat is a limit breach; protein is a minimum, so over stays its own colour
          const color = isOver && m.key !== 'protein' ? 'var(--critical)' : m.color;
          return (
            <div key={m.key} className="stack" style={{ gap: 4, alignItems: 'center' }}>
              <Ring ratio={p.ratio} color={color} label={`${m.label}: ${fmt(p.eaten)} of ${fmt(p.target)} g, ${isOver ? `${fmt(-p.remaining)} g over` : `${fmt(p.remaining)} g left`}`}>
                <div className="num" style={{ fontWeight: 700 }}>
                  {fmt(Math.abs(p.remaining))}
                </div>
                <div className="small faint">{isOver ? 'g over' : 'g left'}</div>
              </Ring>
              <div className="small">
                <span className="macro-item">
                  <i className={`dot ${m.dot}`} aria-hidden />
                  {m.label}
                </span>
              </div>
              <div className="small muted num">
                {fmt(p.eaten)} / {fmt(p.target)} g
              </div>
              {isOver && m.key !== 'protein' && <span className="status-tag critical">⛔ Over</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
