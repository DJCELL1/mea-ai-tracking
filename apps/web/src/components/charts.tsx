import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmt } from '../lib/format';

/**
 * Small, dependency-free SVG charts. One y-axis each; recessive grid; thin marks;
 * a tap/hover readout (crosshair for lines, per-bar for bars) that never gates the data:
 * every value is also in the table below each chart.
 */

const W = 340;
const PAD = { top: 14, right: 8, bottom: 22, left: 36 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10;
  return step * p;
}

function shortDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function weekday(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
}

function Grid({ max, h }: { max: number; h: number }) {
  const ticks = [0, max / 2, max];
  const y = (v: number) => PAD.top + (h - PAD.top - PAD.bottom) * (1 - v / max);
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--faint)">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function TargetLine({ value, max, h }: { value: number; max: number; h: number }) {
  if (!value || value > max) return null;
  const y = PAD.top + (h - PAD.top - PAD.bottom) * (1 - value / max);
  return (
    <g aria-hidden>
      <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" />
    </g>
  );
}

function Readout({ x, children }: { x: number; children: React.ReactNode }) {
  // Keep the readout inside the chart
  const left = `clamp(0px, calc(${(x / W) * 100}% - 70px), calc(100% - 140px))`;
  return (
    <div className="chart-readout" style={{ left }} role="status">
      {children}
    </div>
  );
}

export interface BarDatum {
  date: string;
  value: number | null;
  over?: boolean;
}

/** Daily bars (a week) against a target line. Over-target bars use the critical colour and a ▲ label. */
export function BarChart({ data, target, unit, label }: { data: BarDatum[]; target: number; unit: string; label: string }) {
  const H = 180;
  const max = niceMax(Math.max(target * 1.15, ...data.map((d) => d.value ?? 0)));
  const plotW = W - PAD.left - PAD.right;
  const slot = plotW / data.length;
  const bw = Math.min(28, slot - 8);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="chart" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        <Grid max={max} h={H} />
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const v = d.value ?? 0;
          const top = y(v);
          const base = y(0);
          const r = Math.min(4, (base - top) / 2);
          return (
            <g key={d.date}>
              {d.value != null && v > 0 && (
                <path
                  d={`M${cx - bw / 2},${base} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${base} Z`}
                  fill={d.over ? 'var(--critical)' : 'var(--accent)'}
                  opacity={active == null || active === i ? 1 : 0.55}
                />
              )}
              {d.over && (
                <text x={cx} y={top - 4} textAnchor="middle" fontSize={10} fill="var(--danger)" aria-hidden>
                  ▲
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--faint)" aria-hidden>
                {weekday(d.date)}
              </text>
              {/* Hit target: the whole column */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={H - PAD.top}
                fill="transparent"
                tabIndex={0}
                aria-label={`${weekday(d.date)} ${shortDate(d.date)}: ${d.value == null ? 'nothing logged' : `${fmt(d.value)} ${unit}`}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
        <TargetLine value={target} max={max} h={H} />
      </svg>
      <div className="chart-legend small muted" aria-hidden>
        <span>
          <i style={{ background: 'var(--accent)', height: 8 }} /> {unit} per day
        </span>
        <span>
          <i style={{ background: 'var(--critical)', height: 8 }} /> ▲ over target
        </span>
        <span>
          <i className="dashed" /> Target {fmt(target)}
        </span>
      </div>
      {active != null && (
        <Readout x={PAD.left + slot * active + slot / 2}>
          <strong className="num">{data[active].value == null ? '–' : `${fmt(data[active].value)} ${unit}`}</strong>
          <span className="small muted">
            {weekday(data[active].date)} {shortDate(data[active].date)}
            {data[active].over ? ' · over target' : ''}
          </span>
        </Readout>
      )}
    </div>
  );
}

export interface LinePoint {
  date: string;
  value: number | null;
}

/** Rolling mean over the previous `n` days that have data. */
export function rollingAverage(points: LinePoint[], n = 7): LinePoint[] {
  return points.map((p, i) => {
    const win = points.slice(Math.max(0, i - n + 1), i + 1).filter((x) => x.value != null);
    return { date: p.date, value: p.value == null || win.length < 3 ? null : win.reduce((s, x) => s + x.value!, 0) / win.length };
  });
}

/** Daily values (thin line + dots) with a 7-day average (thicker) and a target line. */
export function LineChart({
  points,
  target,
  unit,
  color,
  label,
  height = 170,
  decimals = 0,
}: {
  points: LinePoint[];
  target?: number;
  unit: string;
  color: string;
  label: string;
  height?: number;
  decimals?: number;
}) {
  const H = height;
  const avg = rollingAverage(points);
  const max = niceMax(Math.max((target ?? 0) * 1.15, ...points.map((p) => p.value ?? 0)));
  const plotW = W - PAD.left - PAD.right;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const path = (pts: LinePoint[]) => {
    let d = '';
    let pen = false;
    pts.forEach((p, i) => {
      if (p.value == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  function locate(e: PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / plotW) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? points.length) - 1));
  }

  const labelEvery = Math.ceil(points.length / 5);
  const dense = points.length > 45;

  return (
    <div className="chart" onPointerLeave={() => setActive(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={locate}
        onPointerDown={locate}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <Grid max={max} h={H} />
        {target != null && <TargetLine value={target} max={max} h={H} />}
        <path d={path(points)} fill="none" stroke={color} strokeWidth={1.25} strokeOpacity={0.55} />
        {!dense &&
          points.map((p, i) =>
            p.value == null ? null : <circle key={p.date} cx={x(i)} cy={y(p.value)} r={2.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} opacity={0.8} />,
          )}
        <path d={path(avg)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--faint)" aria-hidden>
              {shortDate(p.date)}
            </text>
          ) : null,
        )}
        {active != null && (
          <g aria-hidden>
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} />
            {points[active].value != null && <circle cx={x(active)} cy={y(points[active].value!)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}
      </svg>
      <div className="chart-legend small muted" aria-hidden>
        <span>
          <i style={{ background: color, opacity: 0.55, height: 1.5 }} /> Daily
        </span>
        <span>
          <i style={{ background: color, height: 3 }} /> 7-day average
        </span>
        {target != null && (
          <span>
            <i className="dashed" /> Target {fmt(target, decimals)} {unit}
          </span>
        )}
      </div>
      {active != null && (
        <Readout x={x(active)}>
          <strong className="num">{points[active].value == null ? 'Nothing logged' : `${fmt(points[active].value, decimals)} ${unit}`}</strong>
          {avg[active].value != null && <span className="small muted num">7-day avg {fmt(avg[active].value, decimals)}</span>}
          <span className="small muted">{shortDate(points[active].date)}</span>
        </Readout>
      )}
    </div>
  );
}
