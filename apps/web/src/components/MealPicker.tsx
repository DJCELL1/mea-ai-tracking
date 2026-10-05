import { MEALS, type Meal } from '@mea/shared';
import { MEAL_LABELS } from '../lib/format';

export function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <div className="chips" role="group" aria-label="Meal">
      {MEALS.map((m) => (
        <button key={m} type="button" className="chip" aria-pressed={m === value} onClick={() => onChange(m)}>
          {MEAL_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
