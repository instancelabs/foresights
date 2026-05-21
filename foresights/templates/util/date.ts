/**
 * Date helpers. All take a `now: () => Date` from Deps so test-time
 * date logic is deterministic.
 *
 * Status: Phase 2 scaffold — real ports + tests land in Phase 3.
 */

/** Format an ISO timestamp as a localised "1 Mar 2026" string. */
export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/** Human-relative time ("yesterday", "3 days ago", "2 months ago"). */
export const relTime = (iso: string | null | undefined, now: () => Date): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now().getTime() - then);
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 14 * day) return `${Math.floor(diff / day)} days ago`;
  if (diff < 60 * day) return `${Math.floor(diff / (7 * day))} weeks ago`;
  return `${Math.floor(diff / (30 * day))} months ago`;
};

/** 1-indexed day-of-year for a given date (used for spotlight rotation). */
export const dayOfYear = (d: Date): number => {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
};

/** Local YYYY-MM-DD string for the user's calendar day. */
export const todayLocalDate = (now: () => Date): string => {
  const d = now();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
