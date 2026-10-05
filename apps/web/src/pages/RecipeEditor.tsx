import { scalePer100g, sumNutrients, type FoodDto, type RecipeKind } from '@mea/shared';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInvalidate, useRecipe } from '../api/hooks';
import { FoodSearch } from '../components/FoodSearch';
import { MacroLine } from '../components/MacroLine';
import { NumberInput } from '../components/NumberInput';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { fmt } from '../lib/format';

interface Item {
  key: number;
  food: FoodDto;
  grams: number | null;
}

let nextKey = 1;

export function RecipeEditor() {
  const { id } = useParams();
  const recipeId = id ? Number(id) : undefined;
  const { data: existing } = useRecipe(recipeId);
  const navigate = useNavigate();
  const inv = useInvalidate();
  const toast = useToast();

  const [kind, setKind] = useState<RecipeKind>('meal');
  const [name, setName] = useState('');
  const [servings, setServings] = useState<number | null>(1);
  const [cookedWeight, setCookedWeight] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setKind(existing.kind);
    setName(existing.name);
    setServings(existing.servings);
    setCookedWeight(existing.cookedWeightG);
    setNotes(existing.notes ?? '');
    setItems(existing.items.map((i) => ({ key: nextKey++, food: i.food, grams: i.grams })));
  }, [existing]);

  const totals = useMemo(() => sumNutrients(items.filter((i) => i.grams).map((i) => scalePer100g(i.food, i.grams!))), [items]);
  const rawWeight = items.reduce((s, i) => s + (i.grams ?? 0), 0);
  const perServing = kind === 'recipe' && servings ? (totals.energyKcal ?? 0) / servings : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!items.length) return setError('Add at least one food');
    if (items.some((i) => !i.grams)) return setError('Every food needs an amount in grams');
    setBusy(true);
    const body = {
      kind,
      name,
      servings: kind === 'recipe' ? servings ?? 1 : 1,
      cookedWeightG: kind === 'recipe' ? cookedWeight : null,
      notes: notes || null,
      items: items.map((i) => ({ foodId: i.food.id, grams: i.grams! })),
    };
    try {
      if (recipeId) await api.put(`/recipes/${recipeId}`, body);
      else await api.post('/recipes', body);
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
    if (!recipeId || !confirm(`Delete "${name}"? Past log entries are kept.`)) return;
    try {
      await api.del(`/recipes/${recipeId}`);
      await inv.foods();
      toast('Deleted');
      navigate('/foods');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <header className="row between">
        <h1 style={{ margin: 0 }}>{recipeId ? 'Edit' : 'New'} {kind === 'meal' ? 'saved meal' : 'recipe'}</h1>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          Cancel
        </button>
      </header>

      <div className="segmented">
        <button type="button" aria-pressed={kind === 'meal'} onClick={() => setKind('meal')}>
          Saved meal
        </button>
        <button type="button" aria-pressed={kind === 'recipe'} onClick={() => setKind('recipe')}>
          Recipe
        </button>
      </div>
      <div className="small muted">
        {kind === 'meal'
          ? 'Logs each food separately in one tap, e.g. your usual breakfast.'
          : 'Cooked once, then logged by serving or grams, e.g. a batch of bolognese. It shows up in search like any food.'}
      </div>

      <label className="field">
        <span>Name</span>
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </label>

      {kind === 'recipe' && (
        <div className="grid-2">
          <label className="field">
            <span>Servings it makes</span>
            <NumberInput value={servings} onChange={setServings} />
          </label>
          <label className="field">
            <span>Cooked weight (g)</span>
            <NumberInput value={cookedWeight} onChange={setCookedWeight} placeholder={rawWeight ? `${fmt(rawWeight)} raw` : 'optional'} />
          </label>
        </div>
      )}

      <section>
        <div className="section-title">
          <h2>Foods</h2>
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
            ＋ Add food
          </button>
        </div>
        {items.length ? (
          <ul className="list card" style={{ padding: '0 12px' }}>
            {items.map((item) => (
              <li key={item.key} className="list-item" style={{ cursor: 'default' }}>
                <div className="grow">
                  <div className="ellipsis">{item.food.name}</div>
                  <div className="small faint num">{item.grams ? `${fmt(scalePer100g(item.food, item.grams).energyKcal)} kcal` : 'Enter grams'}</div>
                </div>
                <div style={{ width: 90 }}>
                  <NumberInput value={item.grams} onChange={(v) => setItems((list) => list.map((i) => (i.key === item.key ? { ...i, grams: v } : i)))} ariaLabel={`Grams of ${item.food.name}`} />
                </div>
                <span className="small faint">g</span>
                <button type="button" className="btn btn-ghost btn-icon btn-danger" aria-label={`Remove ${item.food.name}`} onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty small">No foods yet.</div>
        )}
      </section>

      {items.length > 0 && (
        <div className="card">
          <div className="row between">
            <strong className="num">{fmt(totals.energyKcal)} kcal total</strong>
            <span className="muted num">{fmt(totals.energyKj)} kJ</span>
          </div>
          <MacroLine n={totals} />
          {perServing != null && servings !== 1 && <div className="small faint num">{fmt(perServing)} kcal per serving</div>}
        </div>
      )}

      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </label>

      {error && <div className="banner error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        Save
      </button>
      {recipeId && (
        <button type="button" className="btn btn-ghost btn-danger btn-block" onClick={remove}>
          Delete
        </button>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} label="Add a food">
        <FoodSearch
          autoFocus
          onPick={(food) => {
            const def = food.servings.find((s) => s.isDefault);
            setItems((list) => [...list, { key: nextKey++, food, grams: def?.grams ?? 100 }]);
            setAdding(false);
          }}
        />
      </Sheet>
    </form>
  );
}
