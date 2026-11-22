"use client";
import * as React from "react";
import { AppProvider } from "@/components/app-context";
import { BeadDetailDrawer } from "@/components/bead-detail-drawer";
import type { BeadsResponse } from "@/lib/api-client";
import { makeIndex } from "@/lib/beads-view";

/** The most beads the drawer's back trail keeps, as in a project's own view. */
const MAX_TRAIL = 25;

type Open = { projectId: string; stack: string[]; nonce: number };

/**
 * State for the one bead drawer of an all-repos page (Needs You, Agent Queue). A bead id is only unique
 * within its repo, so the open drawer remembers which repo it belongs to. Opening starts a fresh back
 * trail; following a link inside the drawer pushes onto it.
 */
export function useRepoDrawer() {
  const [open, setOpen] = React.useState<Open | null>(null);
  const nonce = React.useRef(0);
  const openBead = React.useCallback((projectId: string, id: string) => {
    setOpen({ projectId, stack: [id], nonce: (nonce.current += 1) });
  }, []);
  const push = React.useCallback((id: string) => {
    setOpen((cur) => {
      if (!cur || cur.stack[cur.stack.length - 1] === id) return cur;
      const stack = [...cur.stack, id];
      return { ...cur, stack: stack.length > MAX_TRAIL ? stack.slice(stack.length - MAX_TRAIL) : stack, nonce: (nonce.current += 1) };
    });
  }, []);
  const close = React.useCallback(() => setOpen(null), []);
  return { open, openBead, push, close, setOpen };
}

export type RepoDrawer = ReturnType<typeof useRepoDrawer>;

/**
 * The bead detail drawer for whichever repo `drawer.open` names, inside that repo's own app scope, so
 * Close, Comment and the rest act on the right project exactly as in the project view. Render it once
 * per page; it draws nothing while no bead is open.
 */
export function RepoBeadDrawer({
  drawer,
  dataFor,
  readOnly,
  onSelect,
}: {
  drawer: RepoDrawer;
  /** The loaded beads of a repo (undefined until they load). */
  dataFor: (projectId: string) => BeadsResponse | undefined;
  readOnly: boolean;
  /** Keeps the page's selected card in step with the bead the drawer shows. */
  onSelect?: (projectId: string, id: string | null) => void;
}) {
  const { open, push, close, setOpen } = drawer;
  const projectId = open?.projectId ?? "";
  const data = open ? dataFor(projectId) : undefined;
  const beads = React.useMemo(() => data?.beads ?? [], [data]);
  const index = React.useMemo(() => makeIndex(beads), [beads]);
  const noop = React.useCallback(() => {}, []);

  const stack = open?.stack ?? [];
  const top = stack.length ? stack[stack.length - 1] : null;
  // A bead that was deleted or archived away while open closes the drawer instead of leaving it empty.
  const openId = top && index.has(top) ? top : null;

  const back = React.useCallback(() => {
    setOpen((cur) => {
      if (!cur) return cur;
      const next = cur.stack.slice(0, -1);
      while (next.length && !index.has(next[next.length - 1])) next.pop();
      return next.length ? { ...cur, stack: next, nonce: cur.nonce } : null;
    });
  }, [setOpen, index]);

  const pushDetail = React.useCallback(
    (id: string) => {
      push(id);
      onSelect?.(projectId, id);
    },
    [push, onSelect, projectId],
  );
  const closeDetail = React.useCallback(() => {
    close();
  }, [close]);

  // Always mounted, so the sheet can animate shut; it shows nothing while openId is null.
  return (
    <AppProvider
      value={{
        projectId,
        beads,
        index,
        meta: data?.meta,
        humanAllowlist: data?.meta?.humanAllowlist ?? [],
        readOnly,
        loading: false,
        selectedBeadId: openId,
        selectBead: noop,
        openDetail: (id) => pushDetail(id),
        pushDetail,
        openCreate: noop,
        openEpic: noop,
      }}
    >
      <BeadDetailDrawer
        openId={openId}
        initialAction="view"
        actionNonce={open?.nonce ?? 0}
        canGoBack={stack.length > 1}
        backTo={stack.length > 1 ? stack[stack.length - 2] : null}
        onBack={back}
        onClose={closeDetail}
      />
    </AppProvider>
  );
}
