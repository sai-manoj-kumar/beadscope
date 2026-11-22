"use client";
import * as React from "react";
import { BrandButton } from "@/components/brand-button";
import { Chip, StatusChip } from "@/components/chip";
import { Button, LinkButton, TextArea } from "@/components/controls";
import { PageHeader } from "@/components/page-header";
import { GateApproval } from "@/components/gate-approval";
import { useApp } from "@/components/app-context";
import { useRespondHuman, useDismissHuman } from "@/hooks/use-beads";
import { Icon, typeIconName } from "@/components/icons";
import { OriginBadge, PriorityChip } from "@/components/board/bead-card";
import { beadOrigin } from "@/lib/attribution";
import {
  assignedToYou,
  needsHuman,
  readyHumanGate,
  gateBlocks,
  typeColor,
  relTime,
  fmtDateTime,
} from "@/lib/beads-view";
import { reviewLinks } from "@/lib/review-links";
import { DescriptionContent } from "@/components/description-content";
import { ReviewLinkChips } from "@/components/review-link-chips";
import type { Bead } from "@/lib/schema";
import { isSubmitKey } from "@/lib/keyboard-shortcuts";

/**
 * Mission Control — "Needs You" decision inbox. Surfaces two kinds of items
 * waiting on a person:
 *   1. Beads an agent flagged for a decision (the `human` label, via `bd human`)
 *      — answered inline (comment + clear the flag) or dismissed.
 *   2. Human-approval gates (`bd gate create --type human`) whose blockers are
 *      resolved — approved (closed, which unblocks dependents) from here so they
 *      don't sit invisibly waiting on the board (bead 8qc / gh-6).
 */
export function NeedsYouView() {
  const { beads, index, loading, meta } = useApp();
  const waiting = loading && beads.length === 0;
  const inbox = React.useMemo(() => beads.filter(needsHuman), [beads]);
  const gates = React.useMemo(
    () => beads.filter((b) => readyHumanGate(b, index)),
    [beads, index],
  );
  const actor = meta?.humanActor;
  const mine = React.useMemo(() => beads.filter((b) => assignedToYou(b, actor)), [beads, actor]);
  const total = inbox.length + gates.length + mine.length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Needs You"
        subtitle={waiting ? "Loading…" : total === 0 ? "nothing waiting" : `${total} waiting on you`}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {waiting ? (
          <div className="p-10 text-center text-body text-[var(--text-3)]">Loading…</div>
        ) : total === 0 ? (
          <div className="p-10 text-center text-body text-[var(--text-3)]">
            🎉 Nothing needs you right now. Agents flag beads here with{" "}
            <span className="font-mono">bd human</span>, and human-approval gates
            (<span className="font-mono">bd gate create --type human</span>) show
            up once their blockers clear.
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {gates.map((g) => (
              <GateCard key={g.id} gate={g} />
            ))}
            {inbox.map((b) => (
              <NeedsYouCard key={b.id} bead={b} />
            ))}
            {mine.map((b) => (
              <AssignedCard key={b.id} bead={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The full description, rendered as markdown like the detail drawer: the
 * person is deciding from this card, so a clamped plain-text excerpt hides
 * the context they need.
 */
function CardDescription({ bead }: { bead: Bead }) {
  const { projectId } = useApp();
  if (!bead.description) return null;
  return (
    <DescriptionContent
      text={bead.description}
      projectId={projectId}
      className="mb-3 text-label leading-[1.5] text-[var(--text-2)]"
    />
  );
}

function ReviewLinks({ bead }: { bead: Bead }) {
  const links = reviewLinks(bead);
  if (!links.length) return (
    <p className="mb-3 text-label text-[var(--text-3)]">
      No supporting links found. Review the bead details before deciding.
    </p>
  );
  return (
    <div className="mb-3">
      <div className="mb-1 text-meta font-semibold text-[var(--text-3)]">Links &amp; attachments</div>
      <ReviewLinkChips links={links} />
    </div>
  );
}

/**
 * A ready human-approval gate. "Approve" closes the gate (via `bd close`), which
 * resolves it and unblocks every bead depending on it.
 */
export function GateCard({ gate }: { gate: Bead }) {
  const { beads, openDetail, selectedBeadId, selectBead } = useApp();
  const blocks = React.useMemo(() => gateBlocks(gate.id, beads), [gate.id, beads]);

  return (
    <div
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={gate.id}
      aria-current={selectedBeadId === gate.id ? "true" : undefined}
      onFocus={() => selectBead(gate.id)}
      className={`rounded-[12px] border bg-[var(--surface)] p-4 focus-visible:outline-none ${
        selectedBeadId === gate.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon name="gate" size={15} style={{ color: "var(--brand)" }} />
        <LinkButton mono className="text-meta" onClick={() => openDetail(gate.id)}>
          {gate.id}
        </LinkButton>
        <Chip tone="strong" className="font-semibold uppercase tracking-wide">
          Approval gate
        </Chip>
        <span className="flex-1" />
        <span title={fmtDateTime(gate.updated_at)} className="text-meta text-[var(--text-3)]">
          {relTime(gate.updated_at)}
        </span>
      </div>
      <LinkButton tone="text" className="mb-2 block text-section font-semibold leading-snug" onClick={() => openDetail(gate.id)}>
        {gate.title}
      </LinkButton>
      <CardDescription bead={gate} />
      <ReviewLinks bead={gate} />
      {blocks.length > 0 && (
        <p className="mb-3 text-label leading-[1.5] text-[var(--text-2)]">
          Approving unblocks{" "}
          {blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              {i > 0 && ", "}
              <LinkButton mono tone="text" onClick={() => openDetail(b.id)}>
                {b.id}
              </LinkButton>
            </React.Fragment>
          ))}
          .
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <GateApproval id={gate.id} />
      </div>
    </div>
  );
}

export function NeedsYouCard({ bead }: { bead: Bead }) {
  const { humanAllowlist, openDetail, readOnly, selectedBeadId, selectBead } = useApp();
  const respond = useRespondHuman();
  const dismiss = useDismissHuman();
  const [text, setText] = React.useState("");
  const o = beadOrigin(bead, humanAllowlist);
  const busy = respond.isPending || dismiss.isPending;
  const canRespond = !readOnly && !busy && !!text.trim();
  const submit = () => respond.mutate({ id: bead.id, text: text.trim() });

  return (
    <div
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      className={`rounded-[12px] border bg-[var(--surface)] p-4 focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon name={typeIconName(bead.issue_type)} size={14} style={{ color: typeColor(bead.issue_type) }} />
        <LinkButton mono className="text-meta" onClick={() => openDetail(bead.id)}>
          {bead.id}
        </LinkButton>
        <OriginBadge origin={o} title={o === "human" ? "Human" : "Agent"} />
        <span className="flex-1" />
        <span title={fmtDateTime(bead.updated_at)} className="text-meta text-[var(--text-3)]">
          {relTime(bead.updated_at)}
        </span>
      </div>
      <LinkButton tone="text" className="mb-2 block text-section font-semibold leading-snug" onClick={() => openDetail(bead.id)}>
        {bead.title}
      </LinkButton>
      <CardDescription bead={bead} />
      <ReviewLinks bead={bead} />
      <TextArea
        disabled={readOnly}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (!isSubmitKey(e)) return;
          e.preventDefault();
          if (canRespond) submit();
        }}
        rows={2}
        placeholder="Answer the agent's question… (posts a comment; the bead stays open)"
        className="mb-2"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" disabled={readOnly || busy} onClick={() => dismiss.mutate({ id: bead.id })}>
          Dismiss
        </Button>
        <BrandButton size="sm" icon="check" disabled={!canRespond} onClick={submit}>
          Respond
        </BrandButton>
      </div>
    </div>
  );
}

/**
 * A bead assigned to you with nothing to answer: a compact card that opens the bead. It sits below
 * the decisions (flags and gates) on the Needs You pages, so work that only needs doing is listed
 * without being mistaken for a question.
 */
export function AssignedCard({ bead }: { bead: Bead }) {
  const { openDetail, selectedBeadId, selectBead } = useApp();
  return (
    <div
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      data-assigned-card
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      className={`rounded-[12px] border bg-[var(--surface)] p-4 focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Icon name={typeIconName(bead.issue_type)} size={14} style={{ color: typeColor(bead.issue_type) }} />
        <LinkButton mono className="text-meta" onClick={() => openDetail(bead.id)}>
          {bead.id}
        </LinkButton>
        <StatusChip status={bead.status} />
        <PriorityChip p={bead.priority} />
        <span className="flex-1" />
        <span title={fmtDateTime(bead.updated_at)} className="text-meta text-[var(--text-3)]">
          {relTime(bead.updated_at)}
        </span>
      </div>
      <LinkButton tone="text" className="block text-section font-semibold leading-snug" onClick={() => openDetail(bead.id)}>
        {bead.title}
      </LinkButton>
    </div>
  );
}
