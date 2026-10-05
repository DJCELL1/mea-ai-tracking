import { Link } from 'react-router-dom';
import { useMyFoods, useRecipes } from '../api/hooks';
import { fmt } from '../lib/format';

export function Foods() {
  const { data: foods } = useMyFoods();
  const { data: recipes } = useRecipes();
  return (
    <div className="stack">
      <h1>My foods</h1>
      <div className="grid-2">
        <Link className="btn btn-primary" to="/foods/new">
          ＋ Food from label
        </Link>
        <Link className="btn" to="/recipes/new">
          ＋ Recipe / meal
        </Link>
      </div>

      <section>
        <div className="section-title">
          <h2>Recipes & saved meals</h2>
        </div>
        {recipes?.length ? (
          <ul className="list card" style={{ padding: '0 12px' }}>
            {recipes.map((r) => (
              <li key={r.id}>
                <Link className="list-item" to={`/recipes/${r.id}`} style={{ textDecoration: 'none' }}>
                  <div className="grow">
                    <div className="ellipsis">{r.name}</div>
                    <div className="small faint">
                      {r.kind === 'meal' ? 'Saved meal' : 'Recipe'} · {r.items.length} items · {fmt(r.totals.energyKcal)} kcal total
                    </div>
                  </div>
                  <span className="faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty small">None yet. A recipe is cooked once and logged by portion; a saved meal logs all its foods in one tap.</div>
        )}
      </section>

      <section>
        <div className="section-title">
          <h2>Custom foods</h2>
        </div>
        {foods?.length ? (
          <ul className="list card" style={{ padding: '0 12px' }}>
            {foods.map((f) => (
              <li key={f.id}>
                <Link className="list-item" to={`/foods/${f.id}`} style={{ textDecoration: 'none' }}>
                  <div className="grow">
                    <div className="ellipsis">{f.name}</div>
                    <div className="small faint num">
                      {fmt(f.energyKcal)} kcal · {fmt(f.energyKj)} kJ · P {fmt(f.proteinG, 1)} g / 100 g
                    </div>
                  </div>
                  <span className="faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty small">Add foods from a nutrition label. They'll appear at the top of search.</div>
        )}
      </section>
    </div>
  );
}
