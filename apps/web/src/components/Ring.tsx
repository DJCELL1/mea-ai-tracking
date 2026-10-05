import type { ReactNode } from 'react';

/**
 * Progress ring. The arc colour carries identity (macros) or state (energy);
 * the track is a dim step of the same colour so the ring reads as one meter.
 */
export function Ring({
  ratio,
  color,
  size = 84,
  stroke = 9,
  label,
  children,
}: {
  ratio: number;
  color: string;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, ratio));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`color-mix(in srgb, ${color} 22%, var(--surface))`} strokeWidth={stroke} />
        {shown > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * shown} ${c}`}
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        )}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
