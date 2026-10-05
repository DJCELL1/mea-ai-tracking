import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { fmt } from '../lib/format';
import { useToast } from './Toast';

export interface FoodStats {
  afcdFoods: number;
  bySource: { code: string; name: string; version: string | null; count: number }[];
  lastImport: { at: string; fileName: string; inserted: number; updated: number; skipped: number } | null;
}

interface ImportResult {
  rowsRead: number;
  inserted: number;
  updated: number;
  skippedCount: number;
  skipped: { rowNumber: number; reason: string }[];
  withDescriptions: boolean;
  stats: FoodStats;
}

export function useFoodStats(enabled = true) {
  return useQuery({ queryKey: ['foodStats'], queryFn: () => api.get<FoodStats>('/foods/stats'), staleTime: 60_000, enabled });
}

/** Upload the AFCD Excel file(s) to load or refresh the food database. */
export function FoodImport({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nutrients, setNutrients] = useState<File | null>(null);
  const [details, setDetails] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nutrients) return setError('Choose the "Nutrient profiles" file first.');
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append('nutrients', nutrients);
    if (details) form.append('details', details);
    try {
      const r = await api.upload<ImportResult>('/foods/import', form);
      setResult(r);
      qc.setQueryData(['foodStats'], r.stats);
      await qc.invalidateQueries({ queryKey: ['search'] });
      toast(`Food database ready: ${fmt(r.stats.afcdFoods)} foods`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>AFCD "Nutrient profiles" file (.xlsx), required</span>
        <input className="input" style={{ paddingTop: 10 }} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setNutrients(e.target.files?.[0] ?? null)} />
      </label>
      <label className="field">
        <span>AFCD "Food Details" file (.xlsx), optional, adds descriptions</span>
        <input className="input" style={{ paddingTop: 10 }} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setDetails(e.target.files?.[0] ?? null)} />
      </label>
      {error && <div className="banner error">{error}</div>}
      {result && (
        <div className="banner small" role="status">
          <strong style={{ color: 'var(--accent)' }}>✓ Imported.</strong> {fmt(result.rowsRead)} rows read · {fmt(result.inserted)} new · {fmt(result.updated)} updated
          {result.skippedCount ? ` · ${result.skippedCount} skipped` : ''}
          {result.withDescriptions ? ' · with descriptions' : ''}.
          {result.skipped.slice(0, 3).map((s) => (
            <div key={s.rowNumber} className="faint">
              Row {s.rowNumber}: {s.reason}
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-primary btn-block" disabled={busy || !nutrients}>
        {busy ? 'Importing… (about 10–30 seconds)' : 'Upload and import'}
      </button>
      {result && onDone && (
        <button type="button" className="btn btn-block" onClick={onDone}>
          Start using Mea →
        </button>
      )}
      <div className="small muted">
        Download the files from foodstandards.gov.au (Australian Food Composition Database → Excel files). Uploading again later updates foods in place; nothing is duplicated and your log isn't affected.
      </div>
    </form>
  );
}
