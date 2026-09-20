import type { Config } from "tailwindcss";

/**
 * Every colour maps to a token defined in app/globals.css. Components use the
 * semantic name (bg-surface, text-signal) and never a literal hex, so the whole
 * palette is changeable in one file. (CONVENTIONS.md)
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        hairline: "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        dim: "var(--text-dim)",
        signal: "var(--signal)",
        "signal-dim": "var(--signal-dim)",
        "signal-wash": "var(--signal-wash)",
        positive: "var(--positive)",
        "positive-wash": "var(--positive-wash)",
        caution: "var(--caution)",
        "caution-wash": "var(--caution-wash)",
        negative: "var(--negative)",
        "negative-wash": "var(--negative-wash)",
        neutral: "var(--neutral)",
        "neutral-wash": "var(--neutral-wash)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderColor: { DEFAULT: "var(--hairline)" },
      maxWidth: { content: "1180px" },
    },
  },
  plugins: [],
};

export default config;
