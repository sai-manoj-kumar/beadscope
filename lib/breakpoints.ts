/**
 * The phone layout applies below Tailwind's `md` breakpoint (768px). CSS uses
 * `md:` and `max-width: 767px`; script code that needs the same answer uses this query.
 * Keep the two in step with `--fs-*` in app/globals.css.
 */
export const MOBILE_QUERY = "(max-width: 767px)";

/** Window event the phone top bar fires to open the command palette (see components/keyboard-layer.tsx). */
export const OPEN_PALETTE_EVENT = "beadscope:open-palette";
