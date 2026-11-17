import { listProjects, addProject, hasBeads as configHasBeads, DEMO_PROJECT } from "@/lib/config";
import type { ProjectEntry, DemoProject } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

function annotate(p: ProjectEntry | DemoProject) {
  let hasBeads = true;
  if (p.path !== null) {
    try {
      hasBeads = configHasBeads(p.path);
    } catch {
      hasBeads = false;
    }
  }
  return { ...p, hasBeads };
}

export async function GET() {
  const projects = [DEMO_PROJECT, ...listProjects()].map(annotate);
  return ok({ projects });
}

const addSchema = z.object({ path: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { path: inputPath } = addSchema.parse(await req.json());
    const entry = addProject(inputPath);
    return ok(entry, 201);
  } catch (e) {
    return fail(e);
  }
}
