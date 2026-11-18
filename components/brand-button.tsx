import * as React from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * The solid brand-coloured button for a main action: New, Add project, Save, Create bead. `md` is a
 * page's main action; `sm` is the compact one inside a card, drawer or dialog (Approve, Save, Comment).
 */
export function BrandButton({
  icon,
  size = "md",
  children,
  className = "",
  ...props
}: React.ComponentProps<"button"> & { icon?: IconName; size?: "md" | "sm" }) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      {...props}
      className={`flex flex-shrink-0 items-center justify-center whitespace-nowrap text-white tap-target disabled:opacity-50 ${
        sm
          ? "h-8 gap-[6px] rounded-lg px-3 text-label font-medium"
          : "h-9 gap-[6px] rounded-[9px] px-[14px] text-body font-semibold"
      } ${className}`}
      style={{
        background: "var(--brand-solid)",
        ...(sm ? {} : { boxShadow: "0 2px 8px -2px var(--brand)" }),
        ...props.style,
      }}
    >
      {icon && <Icon name={icon} size={sm ? 14 : 15} />}
      <span className="inline-flex items-center gap-[inherit]">{children}</span>
    </button>
  );
}
