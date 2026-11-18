import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale (see app/globals.css) adds five font-size utilities. Without telling tailwind-merge
// about them it reads `text-label` as a text colour and drops it next to `text-[var(--text-2)]`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["page-title", "section", "body", "label", "meta"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
