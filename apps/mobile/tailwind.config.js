/**
 * Same tokens as the dashboard (apps/dashboard/src/index.css): monochrome UI,
 * color only for status.
 * @type {import('tailwindcss').Config}
 */
const { platformSelect } = require("nativewind/theme");

module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // CSS family names like "ui-monospace" mean nothing to iOS, which then falls back to Courier.
      fontFamily: {
        mono: platformSelect({ ios: "Menlo", android: "monospace", default: "monospace" }),
      },
      colors: {
        bg: "#0a0a0a",
        panel: "#111111",
        border: "#232323",
        hover: "#1a1a1a",
        raised: "#1e1e1e",
        dim: "#6e6e6e",
        fg: "#ededed",
        muted: "#8f8f8f",
        faint: "#4a4a4a",
        ok: "#45c46e",
        warn: "#f5a524",
        danger: "#f2555a",
        chart: "#4f8ff7",
      },
    },
  },
  plugins: [],
};
