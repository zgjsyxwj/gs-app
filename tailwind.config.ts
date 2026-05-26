import type { Config } from "tailwindcss";

/**
 * Design tokens from Direction A — Quiet Editor.
 * Keep tokens in this file + CSS variables; components consume tokens only.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        panel: "hsl(var(--panel))",
        card: "hsl(var(--card))",
        ink: "hsl(var(--ink))",
        "ink-70": "hsl(var(--ink-70))",
        "ink-50": "hsl(var(--ink-50))",
        "ink-30": "hsl(var(--ink-30))",
        "ink-10": "hsl(var(--ink-10))",
        rule: "hsl(var(--rule))",
        "rule-soft": "hsl(var(--rule-soft))",
        accent: "hsl(var(--accent))",
        "accent-soft": "hsl(var(--accent-soft))",
        warn: "hsl(var(--warn))",
        "warn-soft": "hsl(var(--warn-soft))",
        err: "hsl(var(--err))",
        highlight: "hsl(var(--highlight))",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "14px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(0,0,0,0.02)",
        pop: "0 8px 24px rgba(20,18,12,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
