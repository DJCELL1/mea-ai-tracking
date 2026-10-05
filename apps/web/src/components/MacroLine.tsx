import type { Nutrients } from '@mea/shared';
import { g } from '../lib/format';

export function MacroLine({ n, className = 'small muted' }: { n: Nutrients; className?: string }) {
  if (n.proteinG == null && n.carbsG == null && n.fatG == null) return null;
  return (
    <span className={`${className} num`}>
      <span className="p">P {g(n.proteinG)}</span> · <span className="c">C {g(n.carbsG)}</span> · <span className="f">F {g(n.fatG)}</span>
    </span>
  );
}
