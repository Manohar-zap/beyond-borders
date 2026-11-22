import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1600px" },
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: "#101720",
          soft: "#1A2430",
          muted: "#2A3644",
        },
        paper: {
          DEFAULT: "#F5F2EB",
          deep: "#EDE8DD",
        },
        surface: "#FFFFFF",
        line: {
          DEFAULT: "#DED8CB",
          strong: "#C8C0AF",
        },
        muted: "#6D6A61",
        teal: {
          DEFAULT: "#0E6B62",
          soft: "#DCEBE7",
        },
        amber: {
          DEFAULT: "#A9661B",
          soft: "#F3E6D3",
        },
        research: {
          blue: "#2457A6",
          teal: "#0E6B62",
          amber: "#A9661B",
          violet: "#6B4C9A",
          rose: "#A63D57",
          slate: "#5B6B7C",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
      },
      boxShadow: {
        card: "0 1px 0 rgba(16, 23, 32, 0.04), 0 8px 30px -18px rgba(16, 23, 32, 0.25)",
        float: "0 18px 50px -20px rgba(16, 23, 32, 0.35)",
      },
      backgroundImage: {
        "research-grid":
          "linear-gradient(to right, rgba(16,23,32,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,23,32,0.045) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "32px 32px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 420ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
