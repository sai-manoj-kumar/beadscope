"use client";
import * as React from "react";
import { TextInput } from "@/components/controls";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof TextInput>, "type" | "size" | "mono" | "dashed">;

/**
 * A date and time field (`<input type="datetime-local">`) that reads blank while no date is set.
 *
 * Some browsers (iOS Safari) paint today's date and time in an empty datetime-local field, which looks
 * like a saved value. While the value is empty we hide the browser's own text (a rule in
 * `app/globals.css`) and show "Not set" in its place; focusing the field brings the real one back.
 * A half-filled value also reads "" to the page, so we check `validity.badInput` and leave the typed
 * parts visible in that case.
 *
 * `className` goes on the wrapper, so pass width classes (`flex-1`, `min-w-0`) there.
 */
export function DateTimeInput({ className, value, onInput, onKeyUp, onBlur, onChange, ...props }: Props) {
  const [partial, setPartial] = React.useState(false);
  const blank = (value === undefined || value === "") && !partial;
  const track = (e: React.SyntheticEvent<HTMLInputElement>) => setPartial(e.currentTarget.validity.badInput);
  return (
    <div className={cn("relative min-w-0", className)}>
      <TextInput
        {...props}
        type="datetime-local"
        value={value}
        data-blank={blank ? "true" : undefined}
        className="peer"
        onChange={(e) => {
          track(e);
          onChange?.(e);
        }}
        onInput={(e) => {
          track(e);
          onInput?.(e);
        }}
        onKeyUp={(e) => {
          track(e);
          onKeyUp?.(e);
        }}
        onBlur={(e) => {
          track(e);
          onBlur?.(e);
        }}
      />
      {blank && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-[var(--text-3)] peer-focus:hidden"
        >
          Not set
        </span>
      )}
    </div>
  );
}
