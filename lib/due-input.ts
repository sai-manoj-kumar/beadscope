/**
 * Converting a due time between what `<input type="datetime-local">` holds and what `bd` stores.
 *
 * The input holds a wall-clock time with no zone ("2026-12-01T15:30"). We read and write it in the
 * browser's own time zone, so the field shows the same time the drawer prints elsewhere
 * (`fmtDue`). `bd` stores an absolute instant, so we send it an ISO UTC timestamp.
 */

const two = (n: number) => String(n).padStart(2, "0");

/** A stored `due_at` as a datetime-local value in the local time zone; "" when none or unreadable. */
export function dueToInputValue(dueAt?: string | null): string {
  if (!dueAt) return "";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * A datetime-local value (local time zone) as an ISO UTC timestamp; null when it is not a full date
 * and time. A year before 1900 is treated as unfinished typing (the field reads "0002" after one digit).
 */
export function inputValueToDue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1900 ? null : d.toISOString();
}
