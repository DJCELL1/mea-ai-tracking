import { MEALS, type FoodDto, type Meal, type RecipeDto } from '@mea/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInvalidate, useRecipes, useToday } from '../api/hooks';
import { AmountSheet } from '../components/AmountSheet';
import { FoodSearch } from '../components/FoodSearch';
import { MealPicker } from '../components/MealPicker';
import { QuickAddForm } from '../components/QuickAddForm';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { fmt, MEAL_LABELS, mealForTime, prettyDate } from '../lib/format';

type Tab = 'search' | 'meals' | 'quick';

export function Add() {
  const today = useToday();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get('date') ?? today;
  const initialMeal = params.get('meal');
  const [meal, setMeal] = useState<Meal>(MEALS.includes(initialMeal as Meal) ? (initialMeal as Meal) : mealForTime());
  const [tab, setTab] = useState<Tab>('search');
  const [picked, setPicked] = useState<FoodDto | null>(null);

  if (!date || !today) return <div className="spinner" />;

  return (
    <div className="stack">
      <header className="row between">
        <h1 style={{ margin: 0 }}>Add food</h1>
        <button className="btn btn-ghost" onClick={() => navigate(date === today ? '/' : `/?date=${date}`)}>
          Done
        </button>
      </header>
      <div className="small muted">
        {prettyDate(date, today)} · {MEAL_LABELS[meal]}
      </div>
      <MealPicker value={meal} onChange={setMeal} />
      <div className="segmented" role="tablist">
        {(
          [
            ['search', 'Search'],
            ['meals', 'Meals'],
            ['quick', 'Quick add'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'search' && <FoodSearch onPick={setPicked} autoFocus />}
      {tab === 'meals' && <SavedMeals date={date} meal={meal} onPickFood={setPicked} />}
      {tab === 'quick' && <QuickAddForm date={date} meal={meal} />}

      <AmountSheet open={!!picked} onClose={() => setPicked(null)} date={date} food={picked ?? undefined} meal={meal} />
    </div>
  );
}

function SavedMeals({ date, meal, onPickFood }: { date: string; meal: Meal; onPickFood: (f: FoodDto) => void }) {
  const { data: recipes, isLoading } = useRecipes();
  const inv = useInvalidate();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function logMeal(r: RecipeDto) {
    setBusyId(r.id);
    try {
      const res = await api.post<{ logged: number }>(`/recipes/${r.id}/log`, { date, meal });
      await inv.log();
      toast(`Logged ${r.name} (${res.logged} items)`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function pickRecipe(r: RecipeDto) {
    if (!r.foodId) return;
    onPickFood(await api.get<FoodDto>(`/foods/${r.foodId}`));
  }

  if (isLoading) return <div className="spinner" />;
  if (!recipes?.length)
    return (
      <div className="empty">
        No saved meals or recipes yet.
        <div style={{ marginTop: 12 }}>
          <Link className="btn" to="/recipes/new">
            Create one
          </Link>
        </div>
      </div>
    );

  return (
    <ul className="list">
      {recipes.map((r) => (
        <li key={r.id}>
          <div className="list-item" style={{ cursor: 'default' }}>
            <div className="grow">
              <div className="ellipsis">{r.name}</div>
              <div className="small faint num">
                {r.kind === 'meal' ? `Saved meal · ${r.items.length} items · ${fmt(r.totals.energyKcal)} kcal` : `Recipe · ${fmt(r.servings)} serving${r.servings === 1 ? '' : 's'} · ${fmt((r.totals.energyKcal ?? 0) / r.servings)} kcal each`}
              </div>
            </div>
            {r.kind === 'meal' ? (
              <button className="btn btn-primary" disabled={busyId === r.id} onClick={() => logMeal(r)}>
                Log
              </button>
            ) : (
              <button className="btn" onClick={() => pickRecipe(r)}>
                Amount…
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
