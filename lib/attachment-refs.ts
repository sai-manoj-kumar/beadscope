/**
 * `attachment://<beadId>/<file>` refs in a description. Kept free of imports so the browser test
 * suites can load it with plain node.
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A ref's file part ends at whitespace, a closing paren (markdown image) or a quote/angle bracket. */
const refPattern = (beadId: string) =>
  new RegExp(`attachment://${escapeRegExp(beadId)}/([^\\s)"'<>]+)`, "g");

/** The distinct file names the description references under `beadId`, in order of appearance. */
export function attachmentFilesOf(description: string, beadId: string): string[] {
  const files = new Set<string>();
  for (const m of description.matchAll(refPattern(beadId))) files.add(m[1]);
  return [...files];
}

/** Like `repointAttachmentRefs`, but only for refs whose whole file name is in `names`. */
export function repointAttachmentFiles(description: string, fromId: string, toId: string, names: string[]): string {
  const wanted = new Set(names);
  return description.replace(refPattern(fromId), (ref, file: string) =>
    wanted.has(file) ? `attachment://${toId}/${file}` : ref,
  );
}

/** The description with every `attachment://<fromId>/` ref pointed at `toId` instead. */
export function repointAttachmentRefs(description: string, fromId: string, toId: string): string {
  return description.replaceAll(`attachment://${fromId}/`, `attachment://${toId}/`);
}
