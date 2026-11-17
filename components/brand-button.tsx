import * as React from "react";
import { Icon, type IconName } from "@/components/icons";

/** The solid brand-coloured button for a page's main action (New, Add project...). */
export function BrandButton({
  icon,
  children,
  className = "",
  ...props
}: React.ComponentProps<"button"> & { icon?: IconName }) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] px-[14px] text-body font-medium text-white tap-target ${className}`}
      style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)", ...props.style }}
    >
      {icon && <Icon name={icon} size={15} />}
      <span>{children}</span>
    </button>
  );
}
