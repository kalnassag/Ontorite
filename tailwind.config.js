/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic theme colors — switch via CSS custom properties
        th: {
          base: "var(--th-base)",
          surface: "var(--th-surface)",
          input: "var(--th-input)",
          hover: "var(--th-hover)",
          border: "var(--th-border)",
          "border-muted": "var(--th-border-muted)",
          fg: "var(--th-fg)",
          "fg-2": "var(--th-fg-2)",
          "fg-3": "var(--th-fg-3)",
          "fg-4": "var(--th-fg-4)",
        },
        // Property type accent colours
        "prop-object": {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        "prop-datatype": {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        "prop-annotation": {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
        sans: [
          '"IBM Plex Sans"',
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "expand-in": { from: { opacity: "0", transform: "translateY(-4px)" }, to: { opacity: "1", transform: "none" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "expand-in": "expand-in 150ms ease-out",
        "slide-in-right": "slide-in-right 200ms ease-out",
      },
    },
  },
  plugins: [],
};
