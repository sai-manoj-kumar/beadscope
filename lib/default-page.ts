import type { View } from "@/lib/views";

/**
 * The pages a person can choose to open a project on (Settings → Default view). Four are views of
 * the project; "agent-queue" has no project view, only the page across every repo, so choosing it
 * sends the project link there.
 */
export const DEFAULT_PAGES = [
  { id: "epics", label: "Epics" },
  { id: "focus", label: "Focus" },
  { id: "list", label: "List" },
  { id: "needsyou", label: "Needs You" },
  { id: "agent-queue", label: "Agent Queue" },
] as const;
export type DefaultPage = (typeof DEFAULT_PAGES)[number]["id"];
export const DEFAULT_PAGE: DefaultPage = "epics";
export const AGENT_QUEUE_PATH = "/agent-queue";

export function isDefaultPage(value: string | null | undefined): value is DefaultPage {
  return DEFAULT_PAGES.some((p) => p.id === value);
}

/** The project view a default page opens, or null when it is a page outside the project. */
export function defaultPageView(page: DefaultPage): View | null {
  return page === "agent-queue" ? null : page;
}
