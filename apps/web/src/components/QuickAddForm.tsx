import type { LogEntryDto, Meal } from '@mea/shared';
import { useEffect, useState } from 'react';
import { useInvalidate } from '../api/hooks';
import { api, errorMessage } from '../lib/api';
import { MEAL_LABELS } from '../lib/format';
import { MealPicker } from './MealPicker';
import { NumberInput } from './NumberInput';
import { useToast } from './Toast';

/** Quick add (new) or edit an existing quick-add entry. */
export function QuickAddForm({ date, meal: initialMeal, entry, onDone }: { date: string; meal: Meal; entry?: LogEntryDto; onDone?: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? initialMeal);
  const [unit, setUnit] = useState<'kcal' | 'kJ'>('kcal');
  const [name, setName] = useState(entry?.name ?? '');
  const [energy, setEnergy] = useState<number | null>(entry?.energyKcal ?? null);
  const [protein, setProtein] = useState<number | null>(entry?.proteinG ?? null);
  const [carbs, setCarbs] = useState<number | null>(entry?.carbsG ?? null);
  const [fat, setFat] = useState<number | null>(entry?.fatG ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) setMeal(initialMeal);
  }, [initialMeal, entry]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (energy == null) return setError(`Enter ${unit}`);
    setBusy(true);
    setError(null);
    const body = {
      meal,
      name: name || undefined,
      ...(unit === 'kcal' ? { energyKcal: energy } : { energyKj: energy }),
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
    };
    try {
      if (entry) await api.patch(`/log/${entry.id}`, body);
      else await api.post('/log/quick', { ...body, date });
      await inv.log();
      toast(entry ? 'Updated' : `Added to ${MEAL_LABELS[meal].toLowerCase()}`);
      if (!entry) {
        setName('');
        setEnergy(null);
        setProtein(null);
        setCarbs(null);
        setFat(null);
      }
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    try {
      await api.del(`/log/${entry.id}`);
      await inv.log();
      toast('Deleted');
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Name (optional)</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Quick add" maxLength={120} />
      </label>
      <div className="field">
        <span>Energy</span>
        <div className="row">
          <div className="grow">
            <NumberInput value={energy} onChange={setEnergy} placeholder={unit} ariaLabel={`Energy in ${unit}`} />
          </div>
          <div className="segmented" style={{ width: 140 }}>
            {(['kcal', 'kJ'] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => {
                  if (u !== unit && energy != null) setEnergy(Math.round(u === 'kJ' ? energy * 4.184 : energy / 4.184));
                  setUnit(u);
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid-3">
        <label className="field">
          <span className="macro-item"><i className="dot bg-p" aria-hidden />Protein g</span>
          <NumberInput value={protein} onChange={setProtein} />
        </label>
        <label className="field">
          <span className="macro-item"><i className="dot bg-c" aria-hidden />Carbs g</span>
          <NumberInput value={carbs} onChange={setCarbs} />
        </label>
        <label className="field">
          <span className="macro-item"><i className="dot bg-f" aria-hidden />Fat g</span>
          <NumberInput value={fat} onChange={setFat} />
        </label>
      </div>
      <div className="field">
        <span>Meal</span>
        <MealPicker value={meal} onChange={setMeal} />
      </div>
      {error && <div className="banner error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {entry ? 'Save' : `Add to ${MEAL_LABELS[meal]}`}
      </button>
      {entry && (
        <button type="button" className="btn btn-ghost btn-danger btn-block" disabled={busy} onClick={remove}>
          Delete entry
        </button>
      )}
    </form>
  );
}
