import { useEffect, useState } from 'react';

/** Numeric input that allows empty/partial typing and reports numbers (or null when empty). */
export function NumberInput({
  value,
  onChange,
  placeholder,
  step = 'any',
  autoFocus,
  id,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
  autoFocus?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = text === '' ? null : Number(text.replace(',', '.'));
    if (parsed !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className="input num"
      inputMode="decimal"
      type="text"
      step={step}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        setText(t);
        if (t === '') onChange(null);
        else {
          const n = Number(t.replace(',', '.'));
          if (Number.isFinite(n)) onChange(n);
        }
      }}
    />
  );
}
