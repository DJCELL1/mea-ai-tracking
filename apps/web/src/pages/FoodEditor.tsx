import type { FoodDto } from '@mea/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFood, useInvalidate } from '../api/hooks';
import { NumberInput } from '../components/NumberInput';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';

type Basis = 'per100g' | 'perServing';

interface Form {
  name: string;
  description: string;
  basis: Basis;
  servingLabel: string;
  servingGrams: number | null;
  energyUnit: 'kJ' | 'kcal';
  energy: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  sugarsG: number | null;
  fibreG: number | null;
  sodiumMg: number | null;
}

const blank: Form = {
  name: '',
  description: '',
  basis: 'perServing',
  servingLabel: '1 serve',
  servingGrams: null,
  energyUnit: 'kJ',
  energy: null,
  proteinG: null,
  fatG: null,
  carbsG: null,
  sugarsG: null,
  fibreG: null,
  sodiumMg: null,
};

function fromFood(f: FoodDto): Form {
  return { ...blank, name: f.name, description: f.description ?? '', basis: 'per100g', energyUnit: 'kJ', energy: f.energyKj, proteinG: f.proteinG, fatG: f.fatG, carbsG: f.carbsG, sugarsG: f.sugarsG, fibreG: f.fibreG, sodiumMg: f.sodiumMg };
}

/** Add or edit a custom food, typically from an Australian nutrition information panel. */
export function FoodEditor() {
  const { id } = useParams();
  const foodId = id ? Number(id) : undefined;
  const { data: existing } = useFood(foodId);
  const navigate = useNavigate();
  const inv = useInvalidate();
  const toast = useToast();
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing) setForm(fromFood(existing));
  }, [existing]);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const readOnly = existing && !existing.isMine;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.proteinG == null || form.fatG == null || form.carbsG == null || form.energy == null) return setError('Energy, protein, fat and carbs are required');
    setBusy(true);
    const body = {
      name: form.name,
      description: form.description || null,
      basis: form.basis,
      servingLabel: form.servingLabel || undefined,
      servingGrams: form.servingGrams ?? undefined,
      ...(form.energyUnit === 'kJ' ? { energyKj: form.energy } : { energyKcal: form.energy }),
      proteinG: form.proteinG,
      fatG: form.fatG,
      carbsG: form.carbsG,
      sugarsG: form.sugarsG,
      fibreG: form.fibreG,
      sodiumMg: form.sodiumMg,
    };
    try {
      if (foodId) await api.put(`/foods/${foodId}`, body);
      else await api.post('/foods', body);
      await inv.foods();
      toast('Saved');
      navigate('/foods');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!foodId || !confirm('Delete this food? Past log entries keep their values.')) return;
    try {
      await api.del(`/foods/${foodId}`);
      await inv.foods();
      toast('Deleted');
      navigate('/foods');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const per = form.basis === 'per100g' ? 'per 100 g' : `per ${form.servingLabel || 'serve'}`;
  const nutrient = (key: 'proteinG' | 'fatG' | 'carbsG' | 'sugarsG' | 'fibreG' | 'sodiumMg', label: string, unit = 'g', cls = '') => (
    <label className="field">
      <span className="macro-item">
        {cls && <i className={`dot bg-${cls}`} aria-hidden />}
        {label} ({unit})
      </span>
      <NumberInput value={form[key]} onChange={set(key)} />
    </label>
  );

  if (readOnly) return <div className="banner">Only your own foods can be edited.</div>;

  return (
    <form className="stack" onSubmit={save}>
      <header className="row between">
        <h1 style={{ margin: 0 }}>{foodId ? 'Edit food' : 'New food'}</h1>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          Cancel
        </button>
      </header>
      <label className="field">
        <span>Name</span>
        <input className="input" required value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Chobani Greek yoghurt plain" maxLength={200} />
      </label>

      <div className="field">
        <span>Values from the label are</span>
        <div className="segmented">
          <button type="button" aria-pressed={form.basis === 'perServing'} onClick={() => set('basis')('perServing')}>
            Per serve
          </button>
          <button type="button" aria-pressed={form.basis === 'per100g'} onClick={() => set('basis')('per100g')}>
            Per 100 g
          </button>
        </div>
      </div>

      {(form.basis === 'perServing' || !foodId) && (
        <div className="grid-2">
          <label className="field">
            <span>Serving name</span>
            <input className="input" value={form.servingLabel} onChange={(e) => set('servingLabel')(e.target.value)} maxLength={60} />
          </label>
          <label className="field">
            <span>Serving size (g){form.basis === 'perServing' ? '' : ' – optional'}</span>
            <NumberInput value={form.servingGrams} onChange={set('servingGrams')} />
          </label>
        </div>
      )}

      <div className="field">
        <span>Energy {per}</span>
        <div className="row">
          <div className="grow">
            <NumberInput value={form.energy} onChange={set('energy')} ariaLabel="Energy" />
          </div>
          <div className="segmented" style={{ width: 140 }}>
            {(['kJ', 'kcal'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={form.energyUnit === u} onClick={() => set('energyUnit')(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="small muted">Nutrients {per}</div>
      <div className="grid-3">
        {nutrient('proteinG', 'Protein', 'g', 'p')}
        {nutrient('fatG', 'Fat', 'g', 'f')}
        {nutrient('carbsG', 'Carbs', 'g', 'c')}
        {nutrient('sugarsG', 'Sugars')}
        {nutrient('fibreG', 'Fibre')}
        {nutrient('sodiumMg', 'Sodium', 'mg')}
      </div>

      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="input" value={form.description} onChange={(e) => set('description')(e.target.value)} maxLength={1000} />
      </label>

      {error && <div className="banner error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        Save food
      </button>
      {foodId && (
        <button type="button" className="btn btn-ghost btn-danger btn-block" onClick={remove}>
          Delete food
        </button>
      )}
    </form>
  );
}
