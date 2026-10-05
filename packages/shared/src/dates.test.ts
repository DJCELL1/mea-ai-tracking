import { describe, expect, it } from 'vitest';
import { addDays, isDateString, localDate, localTime, tzOffsetMinutes, zonedToUtc } from './dates.js';

const SYD = 'Australia/Sydney';

describe('dates', () => {
  it('knows Sydney standard and daylight time offsets', () => {
    expect(tzOffsetMinutes(new Date('2026-07-01T00:00:00Z'), SYD)).toBe(600);
    expect(tzOffsetMinutes(new Date('2026-01-01T00:00:00Z'), SYD)).toBe(660);
  });
  it('converts local date/time to UTC and back', () => {
    const d = zonedToUtc('2026-10-05', '12:00', SYD); // AEDT
    expect(d.toISOString()).toBe('2026-10-05T01:00:00.000Z');
    expect(localDate(d, SYD)).toBe('2026-10-05');
    expect(localTime(d, SYD)).toBe('12:00');
  });
  it('gives the local date near midnight', () => {
    expect(localDate(new Date('2026-07-01T14:30:00Z'), SYD)).toBe('2026-07-02');
  });
  it('adds days across months and validates dates', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('2026-02-28')).toBe(true);
  });
});
