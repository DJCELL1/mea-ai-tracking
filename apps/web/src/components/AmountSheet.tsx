import { round, scalePer100g, type FoodDto, type LogEntryDto, type Meal } from '@mea/shared';
import { useEffect, useMemo, useState } from 'react';
import { useDeleteEntry, useFood, useLogFood, useUpdateEntry } from '../api/hooks';
import { errorMessage } from '../lib/api';
import { energy, fmt, MEAL_LABELS } from '../lib/format';
import { MacroLine } from './MacroLine';
import { MealPicker } from './MealPicker';
import { NumberInput } from './NumberInput';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

type Unit = 'g' | number; // grams, or a serving id

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  /** Adding a new entry for this food… */
  food?: FoodDto;
  meal?: Meal;
  /** …or editing an existing entry. */
  entry?: LogEntryDto;
  /** Pre-filled amount for a new entry (e.g. a suggestion's usual amount). */
  initialAmount?: { grams?: number | null; servingId?: number | null; servingQty?: number | null };
  onLogged?: () => void;
}

export function AmountSheet({ open, onClose, date, food: foodProp, meal: mealProp, entry, initialAmount, onLogged }: Props) {
  const { data: fetched } = useFood(entry?.foodId ?? undefined);
  const food = foodProp ?? fetched;
  const toast = useToast();
  const logFood = useLogFood();
  const update = useUpdateEntry();
  const del = useDeleteEntry();

  const [meal, setMeal] = useState<Meal>(mealProp ?? entry?.meal ?? 'snack');
  const [unit, setUnit] = useState<Unit>('g');
  const [qty, setQty] = useState<number | null>(100);
  const [error, setError] = useState<string | null>(null);

  // Initialise when opened
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (entry) {
      setMeal(entry.meal);
      if (entry.servingId != null) {
        setUnit(entry.servingId);
        setQty(entry.servingQty ?? 1);
      } else {
        setUnit('g');
        setQty(entry.grams);
      }
    } else if (foodProp) {
      setMeal(mealProp ?? 'snack');
      if (initialAmount?.servingId && foodProp.servings.some((s) => s.id === initialAmount.servingId)) {
        setUnit(initialAmount.servingId);
        setQty(initialAmount.servingQty ?? 1);
        return;
      }
      if (initialAmount?.grams) {
        setUnit('g');
        setQty(initialAmount.grams);
        return;
      }
      const def = foodProp.servings.find((s) => s.isDefault) ?? foodProp.servings[0];
      if (def) {
        setUnit(def.id);
        setQty(1);
      } else {
        setUnit('g');
        setQty(100);
      }
    }
  }, [open, entry, foodProp, mealProp, initialAmount]);

  const serving = typeof unit === 'number' ? food?.servings.find((s) => s.id === unit) : undefined;
  const grams = qty == null ? null : serving ? round(serving.grams * qty, 1) : qty;
  const preview = useMemo(() => {
    if (grams == null) return null;
    if (food) return scalePer100g(food, grams);
    // Food no longer exists: scale the entry's snapshot
    if (entry?.grams) {
      const f = grams / entry.grams;
      return { ...entry, energyKcal: (entry.energyKcal ?? 0) * f, energyKj: (entry.energyKj ?? 0) * f, proteinG: (entry.proteinG ?? 0) * f, carbsG: (entry.carbsG ?? 0) * f, fatG: (entry.fatG ?? 0) * f };
    }
    return null;
  }, [food, grams, entry]);

  const busy = logFood.isPending || update.isPending || del.isPending;

  async function save() {
    if (grams == null || grams <= 0) return setError('Enter an amount');
    setError(null);
    const amount = serving ? { servingId: serving.id, servingQty: qty! } : { grams };
    try {
      if (entry) {
        await update.mutateAsync({ id: entry.id, meal, ...amount });
        toast('Updated');
      } else if (food) {
        await logFood.mutateAsync({ date, meal, foodId: food.id, ...amount });
        toast(`Added to ${MEAL_LABELS[meal].toLowerCase()}`);
        onLogged?.();
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!entry) return;
    try {
      await del.mutateAsync(entry.id);
      toast('Deleted');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const name = food?.name ?? entry?.name ?? '';
  const units: { id: Unit; label: string }[] = [{ id: 'g', label: 'grams' }, ...(food?.servings ?? []).map((s) => ({ id: s.id as Unit, label: `${s.label} (${fmt(s.grams, 1)} g)` }))];
  const stepBy = unit === 'g' ? 10 : 0.5;

  return (
    <Sheet open={open} onClose={onClose} label={entry ? 'Edit entry' : 'Add food'}>
      <div className="stack">
        <div>
          <h2>{name}</h2>
          {food && (
            <div className="small faint">
              per 100 g: {energy(food)} · P {fmt(food.proteinG, 1)} g
            </div>
          )}
        </div>

        <div className="field">
          <span>Amount</span>
          <div className="stepper">
            <button type="button" className="btn btn-icon" aria-label="Less" onClick={() => setQty((q) => Math.max(0, round((q ?? 0) - stepBy, 2)))}>
              −
            </button>
            <NumberInput value={qty} onChange={setQty} ariaLabel="Amount" />
            <button type="button" className="btn btn-icon" aria-label="More" onClick={() => setQty((q) => round((q ?? 0) + stepBy, 2))}>
              +
            </button>
          </div>
          {units.length > 1 && (
            <select
              className="input"
              aria-label="Unit"
              value={String(unit)}
              onChange={(e) => {
                const v = e.target.value === 'g' ? 'g' : Number(e.target.value);
                // Keep roughly the same amount when switching units
                if (v === 'g') setQty(grams ?? 100);
                else setQty(1);
                setUnit(v);
              }}
            >
              {units.map((u) => (
                <option key={String(u.id)} value={String(u.id)}>
                  {u.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <span>Meal</span>
          <MealPicker value={meal} onChange={setMeal} />
        </div>

        {preview && (
          <div className="card">
            <div className="row between">
              <strong className="num">{fmt(preview.energyKcal)} kcal</strong>
              <span className="muted num">{fmt(preview.energyKj)} kJ</span>
            </div>
            <MacroLine n={preview} />
            {serving && <div className="small faint">{fmt(grams, 1)} g</div>}
          </div>
        )}

        {error && <div className="banner error">{error}</div>}

        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={save}>
          {entry ? 'Save' : `Add to ${MEAL_LABELS[meal]}`}
        </button>
        {entry && (
          <button type="button" className="btn btn-ghost btn-danger btn-block" disabled={busy} onClick={remove}>
            Delete entry
          </button>
        )}
      </div>
    </Sheet>
  );
}
