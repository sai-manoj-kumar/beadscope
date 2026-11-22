import { z } from "zod";

/**
 * Canonical types mirroring the beads (bd) data model. Verified against
 * beads `internal/types/types.go` and `docs/JSON_SCHEMA.md`. We add no new
 * persisted fields — beads stays the single source of truth.
 */

export const BEAD_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "closed",
  "pinned",
  "hooked",
] as const;
export type BeadStatus = (typeof BEAD_STATUSES)[number];

// Human-facing subset of bd issue_type (internal molecule/gate/event omitted).
export const BEAD_TYPES = [
  "task",
  "feature",
  "bug",
  "chore",
  "epic",
  "decision",
  "spike",
  "story",
  "milestone",
] as const;
export type BeadType = (typeof BEAD_TYPES)[number];

export const DEP_TYPES = [
  "blocks",
  "parent-child",
  "conditional-blocks",
  "waits-for",
  "related",
  "relates-to",
  "discovered-from",
  "duplicates",
  "supersedes",
  "caused-by",
  "validates",
  "tracks",
] as const;
export type DepType = (typeof DEP_TYPES)[number];

// Dep types that block the ready queue (beads semantics).
export const BLOCKING_DEP_TYPES = [
  "blocks",
  "parent-child",
  "conditional-blocks",
  "waits-for",
] as const satisfies readonly DepType[];
export type BlockingDepType = (typeof BLOCKING_DEP_TYPES)[number];

export const PRIORITIES = [0, 1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Loose enums: accept unknown values from bd without throwing (forward-compat). */
const statusSchema = z.string();
const typeSchema = z.string();

/** Flat dependency link records, as emitted by `bd export --json`. */
const flatDepSchema = z
  .object({
    issue_id: z.string().optional(),
    depends_on_id: z.string(),
    type: z.string(),
    created_by: z.string().optional(),
    created_at: z.string().optional(),
  });

/**
 * `bd show --json` instead expands each dependency into the full target bead
 * ({ id, title, status, …, dependency_type }). Normalize that shape to the
 * flat link record so consumers see a single canonical Dependency type
 * (gh-12). The two shapes are disjoint: flat has depends_on_id/type, expanded
 * has id/dependency_type. The expanded record's created_at/created_by belong
 * to the target bead, not the link, so they are intentionally not mapped.
 */
const expandedDepSchema = z
  .object({ id: z.string(), dependency_type: z.string() })
  .transform((d): z.infer<typeof flatDepSchema> => ({
    depends_on_id: d.id,
    type: d.dependency_type,
  }));

export const dependencySchema = z.union([flatDepSchema, expandedDepSchema]);
export type Dependency = z.infer<typeof flatDepSchema>;

export const commentSchema = z
  .object({
    id: z.string().optional(),
    issue_id: z.string().optional(),
    author: z.string().default(""),
    text: z.string().default(""),
    created_at: z.string().optional(),
  });
export type Comment = z.infer<typeof commentSchema>;

export const beadSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional().default(""),
    notes: z.string().optional().default(""),
    design: z.string().optional().default(""),
    acceptance_criteria: z.string().optional().default(""),
    status: statusSchema,
    priority: z.coerce.number().int().min(0).max(4).default(2),
    issue_type: typeSchema,
    assignee: z.string().optional().default(""),
    owner: z.string().optional(),
    created_by: z.string().optional().default(""),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    started_at: z.string().optional().nullable(),
    closed_at: z.string().optional().nullable(),
    /** Due date and time (`bd create --due`) as an ISO timestamp; absent when none is set. */
    due_at: z.string().optional().nullable(),
    /** Defer date and time (`bd update --defer`) as an ISO timestamp; absent when none is set. */
    defer_until: z.string().optional().nullable(),
    close_reason: z.string().optional().nullable(),
    labels: z.array(z.string()).optional().default([]),
    dependencies: z.array(dependencySchema).optional().default([]),
    comments: z.array(commentSchema).optional().default([]),
    dependency_count: z.number().optional(),
    dependent_count: z.number().optional(),
    comment_count: z.number().optional(),
    parent: z.string().nullable().optional(),
    /**
     * Gate sub-type from `bd gate create --type <t>` (human | timer | gh:run |
     * gh:pr | bead). Present only on issue_type "gate". Preserved here — zod
     * strips unknown keys — so the UI can surface human-approval gates that are
     * waiting on a person (bead 8qc / gh-6).
     */
    await_type: z.string().optional(),
  });
export type Bead = z.infer<typeof beadSchema>;

export const beadArraySchema = z.array(beadSchema);

/** bd --json envelope: { schema_version, data } (BD_JSON_ENVELOPE=1). */
export function unwrapEnvelope(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>).data;
  }
  return raw;
}

// ---- Input shapes for writes ----

/** A due time as the browser sends it: an ISO timestamp with an explicit zone (see lib/due-input.ts). */
const DUE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/**
 * True when the date and clock fields of an ISO timestamp name a real moment. `Date.parse` is not
 * enough: it rolls "2030-02-30" over to March 2 and accepts hour 24, so the fields are checked
 * against a UTC round trip of year, month and day, and against the clock ranges.
 */
function isRealDue(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(v);
  if (!m) return false;
  const [year, month, day, hour, minute, second = 0, offH = 0, offM = 0] = m.slice(1).map((p) => (p === undefined ? undefined : Number(p))) as number[];
  if (hour > 23 || minute > 59 || second > 59 || offH > 23 || offM > 59) return false;
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day); // unlike Date.UTC, keeps years 0-99 as written
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return false;
  return Number.isFinite(Date.parse(v));
}
const dueIsoSchema = z
  .string()
  .regex(DUE_ISO_PATTERN, "Due must be an ISO date and time")
  .refine(isRealDue, "Due must be a real date and time");

export const createInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  issue_type: z.enum(BEAD_TYPES).default("task"),
  priority: z.coerce.number().int().min(0).max(4).default(2),
  description: z.string().optional().default(""),
  assignee: z.string().optional().default(""),
  labels: z.array(z.string()).optional().default([]),
  parent: z.string().optional().default(""),
  /** When true, the bead starts in the Backlog (deferred) instead of Ready. */
  backlog: z.boolean().optional().default(false),
  /** Due date and time (`bd create --due`) as an ISO timestamp with a zone; absent or "" means none. */
  due: z.union([z.literal(""), dueIsoSchema]).optional().default(""),
});
export type CreateInput = z.infer<typeof createInputSchema>;

export const updateInputSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(BEAD_STATUSES).optional(),
  priority: z.coerce.number().int().min(0).max(4).optional(),
  issue_type: z.enum(BEAD_TYPES).optional(),
  assignee: z.string().optional(),
  /**
   * Full desired label set (replace-all). Deliberately has NO `.default([])` —
   * a default would make every unrelated patch (a priority or status change)
   * look like "set labels to empty" and silently wipe the bead's labels.
   * Absent means "leave labels alone"; `[]` means "clear them".
   */
  labels: z.array(z.string()).optional(),
  /**
   * New parent issue id. Mirrors `bd update --parent` semantics exactly, and
   * the absent-vs-empty distinction IS the contract: field absent means "leave
   * the parent alone", `""` means "detach from the current parent". Hence
   * `.optional()` with no default — a default would make detaching the only
   * expressible intent and reparenting impossible to distinguish from a no-op.
   */
  parent: z.string().optional(),
  /**
   * New due date and time as an ISO timestamp with a zone (`bd update --due`). Same absent-vs-empty
   * contract as `parent`: absent leaves the due date alone, `""` clears it.
   */
  due: z.union([z.literal(""), dueIsoSchema]).optional(),
  /**
   * New defer date and time as an ISO timestamp with a zone (`bd update --defer`). Same absent-vs-empty
   * contract as `due`: absent leaves it alone, `""` clears it.
   */
  defer: z.union([z.literal(""), dueIsoSchema]).optional(),
});
export type UpdateInput = z.infer<typeof updateInputSchema>;

export const addCommentSchema = z.object({ text: z.string().min(1) });

export const addDepSchema = z.object({
  depends_on_id: z.string().min(1),
  type: z.enum(DEP_TYPES).default("blocks"),
});
