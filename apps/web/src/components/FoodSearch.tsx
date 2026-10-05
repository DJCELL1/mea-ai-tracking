import type { FoodDto } from '@mea/shared';
import { useEffect, useState } from 'react';
import { useFoodSearch } from '../api/hooks';
import { fmt } from '../lib/format';

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const SOURCE_TAG: Record<string, string> = { custom: 'Mine', recipe: 'Recipe' };

export function FoodRow({ food, onPick }: { food: FoodDto; onPick: (f: FoodDto) => void }) {
  const tag = SOURCE_TAG[food.sourceCode];
  return (
    <li>
      <button type="button" className="list-item" onClick={() => onPick(food)}>
        <div className="grow">
          <div className="ellipsis">{food.name}</div>
          <div className="small faint num">
            {tag && <span className="p">{tag} · </span>}
            {fmt(food.energyKcal)} kcal · {fmt(food.energyKj)} kJ · P {fmt(food.proteinG, 1)} g <span className="faint">/ 100 g</span>
          </div>
        </div>
        <span aria-hidden className="faint">
          ＋
        </span>
      </button>
    </li>
  );
}

/** Search box + results. With an empty query shows recent and most-used foods. */
export function FoodSearch({ onPick, autoFocus, placeholder = 'Search foods' }: { onPick: (f: FoodDto) => void; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim());
  const { data, isFetching, isError } = useFoodSearch(debounced);

  return (
    <div className="stack">
      <input
        className="input"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search foods"
      />
      {isError && <div className="banner error">Search failed. Check your connection.</div>}
      {debounced ? (
        data?.query === debounced && data.results.length === 0 ? (
          <div className="empty">{isFetching ? 'Searching…' : `No foods match "${debounced}". Try fewer words, or use Quick add.`}</div>
        ) : (
          <ul className="list">
            {data?.results.map((f) => <FoodRow key={f.id} food={f} onPick={onPick} />)}
          </ul>
        )
      ) : (
        <>
          {!!data?.recent?.length && (
            <section>
              <div className="section-title">
                <h2 className="small muted">Recent</h2>
              </div>
              <ul className="list">
                {data.recent.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={onPick} />
                ))}
              </ul>
            </section>
          )}
          {!!data?.frequent?.length && (
            <section>
              <div className="section-title">
                <h2 className="small muted">Most logged</h2>
              </div>
              <ul className="list">
                {data.frequent.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={onPick} />
                ))}
              </ul>
            </section>
          )}
          {data && !data.recent?.length && <div className="empty">Start typing to search the Australian food database.</div>}
        </>
      )}
    </div>
  );
}
