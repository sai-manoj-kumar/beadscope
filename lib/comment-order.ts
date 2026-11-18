// Comments are shown newest first. Ties (same timestamp, or none) keep the
// later-posted comment above the earlier one, since bd returns them oldest first.
export function newestFirst<T extends { created_at?: string | null }>(comments: readonly T[]): T[] {
  const time = (c: T) => {
    const t = c.created_at ? Date.parse(c.created_at) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return comments
    .map((c, i) => ({ c, i, t: time(c) }))
    .sort((a, b) => b.t - a.t || b.i - a.i)
    .map((x) => x.c);
}
