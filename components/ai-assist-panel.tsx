"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { api, type AssistResult } from "@/lib/api-client";
import { useUpdateBead } from "@/hooks/use-beads";
import { DescriptionContent } from "@/components/description-content";
import type { Bead } from "@/lib/schema";
import { BrandButton } from "@/components/brand-button";
import { Button, IconButton, LinkButton } from "@/components/controls";

/**
 * In-UI version of the /refine-beads workflow: ask the local Claude CLI to
 * suggest a refined description (with acceptance criteria + a checklist),
 * labels, and likely duplicates. Read-only until the user confirms — only the
 * description is written, via the normal update path.
 */
export function AiAssistPanel({ bead }: { bead: Bead }) {
  const { projectId, pushDetail } = useApp();
  const update = useUpdateBead();
  const [result, setResult] = React.useState<AssistResult | null>(null);

  const assist = useMutation({
    mutationFn: () => api.assist(projectId, bead.id),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error((e as Error).message),
  });

  const applyDescription = () => {
    if (!result) return;
    update.mutate(
      { id: bead.id, patch: { description: result.description } },
      {
        onSuccess: () => {
          toast.success("Applied AI description");
          setResult(null);
        },
      },
    );
  };

  return (
    <div className="mt-2">
      <Button size="sm" onClick={() => assist.mutate()} disabled={assist.isPending}>
        <Icon name="feature" size={14} style={{ color: "var(--brand)" }} />
        {assist.isPending ? "Refining with AI…" : "Refine with AI"}
      </Button>

      {result && (
        <div className="mt-2 rounded-[10px] border bg-[var(--surface-2)] p-3" style={{ borderColor: "var(--brand)" }}>
          <div className="mb-2 flex items-center gap-2 text-label font-semibold text-[var(--brand)]">
            <Icon name="feature" size={14} /> AI suggestion
            <span className="flex-1" />
            <IconButton variant="ghost" size="sm" label="Dismiss" title="Dismiss" onClick={() => setResult(null)}>
              <Icon name="x" size={13} />
            </IconButton>
          </div>

          <div className="mb-1 text-meta uppercase tracking-[.03em] text-[var(--text-3)]">
            Refined description
          </div>
          <DescriptionContent
            text={result.description}
            projectId={projectId}
            className="rounded-[8px] border border-border bg-[var(--surface)] p-[10px_11px] text-body text-[var(--text-2)]"
          />

          {result.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-[6px] text-meta">
              <span className="text-[var(--text-3)]">Suggested labels:</span>
              {result.labels.map((l) => (
                <span key={l} className="rounded-md border border-border bg-[var(--surface)] px-[7px] py-px font-mono">
                  {l}
                </span>
              ))}
            </div>
          )}

          {result.duplicates.length > 0 && (
            <div className="mt-2 text-meta">
              <div className="text-[var(--text-3)]">Possible duplicates:</div>
              {result.duplicates.map((d) => (
                <LinkButton
                  key={d.id}
                  tone="text"
                  onClick={() => pushDetail(d.id)}
                  className="mt-1 block"
                >
                  <span className="font-mono text-[var(--text-3)]">{d.id}</span>{" "}
                  <span className="text-[var(--text-2)]">{d.title}</span>
                  {d.reason ? <span className="text-[var(--text-3)]"> — {d.reason}</span> : null}
                </LinkButton>
              ))}
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" onClick={() => setResult(null)}>
              Reject
            </Button>
            <BrandButton size="sm" icon="check" onClick={applyDescription} disabled={update.isPending}>
              Apply description
            </BrandButton>
          </div>
          <div className="mt-1 text-meta text-[var(--text-3)]">
            Labels and duplicates are advisory — only the description is written, on confirm.
          </div>
        </div>
      )}
    </div>
  );
}
