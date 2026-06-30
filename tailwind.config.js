/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
    },
    extend: {
      colors: {
        // 编辑型居家杂志配色
        paper: "#F5F1EA", // 米白底
        cream: "#FBF8F2", // 更浅的纸面
        ink: "#1F1B16", // 炭黑文字
        clay: {
          DEFAULT: "#A86B3C", // 陶土棕主调
          50: "#F7EFE7",
          100: "#EFD9C4",
          200: "#E0B695",
          300: "#D19A6B",
          400: "#B97E4F",
          500: "#A86B3C",
          600: "#8C5630",
          700: "#6F4324",
          800: "#523318",
          900: "#36220F",
        },
        moss: {
          DEFAULT: "#3D5A4A", // 墨绿辅色
          light: "#5C7A6A",
          dark: "#2A3F33",
        },
        ochre: "#D97A3C", // 赭石橙强调
        line: "#E0D8CC", // 分隔线
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Fraunces"', "serif"],
        display: ['"Fraunces"', '"Noto Serif SC"', "serif"],
        sans: ['"Noto Sans SC"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(31,27,22,0.04), 0 8px 24px -12px rgba(31,27,22,0.12)",
        cardHover: "0 2px 6px rgba(31,27,22,0.06), 0 16px 40px -16px rgba(168,107,60,0.28)",
        inset: "inset 0 0 0 1px rgba(31,27,22,0.06)",
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.7)", opacity: "0.8" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        pulseRing: "pulseRing 2s ease-out infinite",
        fadeUp: "fadeUp 0.5s ease-out both",
        fadeIn: "fadeIn 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
