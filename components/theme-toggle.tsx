"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { IconButton } from "@/components/controls";
import { useTheme } from "@/components/theme-provider";
import { themeButtonInfo } from "@/lib/themes";

/** The button that cycles the colour theme. Used in the sidebar and on the project launcher. */
export function ThemeToggle({ size = "md" }: { size?: "md" | "lg" }) {
  const { mode, choice, toggle } = useTheme();
  const info = themeButtonInfo(choice, mode);
  return (
    <IconButton size={size} label={info.title} title={info.title} onClick={toggle}>
      <Icon name={info.icon} size={15} />
    </IconButton>
  );
}
