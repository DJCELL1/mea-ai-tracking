import type { Nutrients } from '@mea/shared';
import { g } from '../lib/format';

/** Macro amounts: identity comes from the coloured dot, text stays in text colours. */
export function MacroLine({ n, className = 'small muted' }: { n: Nutrients; className?: string }) {
  if (n.proteinG == null && n.carbsG == null && n.fatG == null) return null;
  return (
    <span className={`${className} num`} style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      <span className="macro-item">
        <i className="dot bg-p" aria-hidden />P {g(n.proteinG)}
      </span>
      <span className="macro-item">
        <i className="dot bg-c" aria-hidden />C {g(n.carbsG)}
      </span>
      <span className="macro-item">
        <i className="dot bg-f" aria-hidden />F {g(n.fatG)}
      </span>
    </span>
  );
}
