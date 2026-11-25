import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getProject, DEMO_PROJECT, ConfigError } from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per image

/** Resolve a project's <repo>/.beads/attachments dir, or throw a typed error. */
function attachmentsDir(projectId: string): string {
  if (projectId === DEMO_PROJECT.id) {
    throw new ConfigError(
      "Attachments aren't available for the Demo project (it has no folder).",
      "bd_unavailable",
    );
  }
  const project = getProject(projectId);
  if (!project || project.path === null) {
    throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
  }
  return path.join(project.path, ".beads", "attachments");
}

/** Sanitize a single path segment so it can never escape the attachments dir. */
function safeSegment(s: string, fallback: string): string {
  const cleaned = path.basename(s).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || fallback;
}

// POST — multipart upload of one image. Fields: file, beadId (real id or draft token).
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const dir = attachmentsDir(projectId);

    const form = await req.formData();
    const file = form.get("file");
    const beadIdRaw = String(form.get("beadId") || "").trim();
    if (!(file instanceof File)) {
      return ok({ error: "No file uploaded", code: "invalid_input" }, 400);
    }
    if (!beadIdRaw) {
      return ok({ error: "Missing beadId", code: "invalid_input" }, 400);
    }
    if (!file.type.startsWith("image/")) {
      return ok({ error: `Only image files are allowed (got ${file.type || "unknown"})`, code: "invalid_input" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return ok({ error: `Image is too large (max ${MAX_BYTES / (1024 * 1024)} MB)`, code: "invalid_input" }, 400);
    }

    const beadId = safeSegment(beadIdRaw, "draft");
    const original = safeSegment(file.name || "image", "image");
    const stored = `${crypto.randomUUID().slice(0, 8)}-${original}`;

    const targetDir = path.join(dir, beadId);
    fs.mkdirSync(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, stored);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(fullPath, buf);

    const ref = `attachment://${beadId}/${stored}`;
    const url = `/api/p/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(beadId)}/${encodeURIComponent(stored)}`;
    const name = file.name ? path.basename(file.name) : original;
    return ok({ ref, url, name }, 201);
  } catch (e) {
    return fail(e);
  }
}

// PUT — finalize: rename a draft attachment folder to the real bead id once it exists.
// With `copyFrom` + `files` it instead copies those files from another bead's folder (a clone), so
// the new bead keeps its images if the source bead is deleted. The source folder is left as is.
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const dir = attachmentsDir(projectId);
    const body = (await req.json()) as { draftId?: string; beadId?: string; copyFrom?: string; files?: unknown };
    if (body.copyFrom !== undefined) {
      const fromId = safeSegment(String(body.copyFrom || ""), "");
      const toId = safeSegment(String(body.beadId || ""), "");
      if (!fromId || !toId || !Array.isArray(body.files)) {
        return ok({ error: "Missing copyFrom, beadId or files", code: "invalid_input" }, 400);
      }
      const copied: string[] = [];
      for (const raw of body.files) {
        const name = safeSegment(String(raw), "");
        if (!name || name !== raw) continue; // only plain file names, never a path
        const src = path.join(dir, fromId, name);
        // lstat: a symlink in the source folder must not be followed out of the attachments dir.
        let stat: fs.Stats;
        try {
          stat = fs.lstatSync(src);
        } catch {
          continue; // the source image is already gone; nothing to copy
        }
        if (!stat.isFile()) continue;
        const target = path.join(dir, toId, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(src, target, fs.constants.COPYFILE_EXCL);
        copied.push(name);
      }
      return ok({ copied });
    }
    const draftId = safeSegment(String(body.draftId || ""), "");
    const beadId = safeSegment(String(body.beadId || ""), "");
    if (!draftId || !beadId) {
      return ok({ error: "Missing draftId or beadId", code: "invalid_input" }, 400);
    }
    const from = path.join(dir, draftId);
    const to = path.join(dir, beadId);
    if (!fs.existsSync(from)) {
      // Nothing was uploaded under the draft token — a clean no-op.
      return ok({ moved: false });
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.existsSync(to)) {
      // Merge: move each file individually if the target dir already exists.
      for (const f of fs.readdirSync(from)) {
        fs.renameSync(path.join(from, f), path.join(to, f));
      }
      fs.rmdirSync(from);
    } else {
      fs.renameSync(from, to);
    }
    return ok({ moved: true });
  } catch (e) {
    return fail(e);
  }
}
