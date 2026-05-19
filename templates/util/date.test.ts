import { describe, expect, it } from 'vitest';
import { dayOfYear, fmtDate, relTime, todayLocalDate } from './date';

describe('fmtDate', () => {
  it('formats an ISO date', () => {
    // Use a UTC-anchored date with a non-edge day so locale doesn't matter
    expect(fmtDate('2026-03-15T12:00:00Z')).toMatch(/2026/);
    expect(fmtDate('2026-03-15T12:00:00Z')).toMatch(/Mar/);
  });

  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(fmtDate(undefined)).toBe('');
  });

  it('returns empty string for an invalid ISO', () => {
    expect(fmtDate('not-a-date')).toBe('');
  });
});

describe('relTime', () => {
  // Frozen "now" — 2026-05-19 12:00 UTC. Every test uses the same anchor.
  const NOW = () => new Date('2026-05-19T12:00:00Z');

  it('returns "today" for sub-day differences', () => {
    expect(relTime('2026-05-19T06:00:00Z', NOW)).toBe('today');
  });

  it('returns "yesterday" for ~24h ago', () => {
    expect(relTime('2026-05-18T12:00:00Z', NOW)).toBe('yesterday');
  });

  it('returns "N days ago" for <14 days', () => {
    expect(relTime('2026-05-14T12:00:00Z', NOW)).toBe('5 days ago');
  });

  it('returns "N weeks ago" for 14–59 days', () => {
    expect(relTime('2026-04-19T12:00:00Z', NOW)).toBe('4 weeks ago');
  });

  it('returns "N months ago" for 60+ days', () => {
    expect(relTime('2026-01-19T12:00:00Z', NOW)).toBe('4 months ago');
  });

  it('returns empty string for null', () => {
    expect(relTime(null, NOW)).toBe('');
  });

  it('treats future dates as "today" (clamps diff to 0)', () => {
    expect(relTime('2026-05-20T12:00:00Z', NOW)).toBe('today');
  });
});

describe('dayOfYear', () => {
  it('returns 1 for Jan 1', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
  });

  it('returns 365 for Dec 31 in a common year', () => {
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
  });

  it('returns 366 for Dec 31 in a leap year', () => {
    // 2028 is a leap year (divisible by 4, not by 100)
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366);
  });
});

describe('todayLocalDate', () => {
  it('formats a frozen date as YYYY-MM-DD in local time', () => {
    const now = () => new Date(2026, 4, 19, 14, 30); // May 19 2026 14:30 local
    expect(todayLocalDate(now)).toBe('2026-05-19');
  });

  it('zero-pads single-digit months and days', () => {
    const now = () => new Date(2026, 0, 5, 10, 0); // Jan 5 2026
    expect(todayLocalDate(now)).toBe('2026-01-05');
  });
});
