/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#f5f5f0",
          card: "#ffffff",
          muted: "#eceae3",
        },
        border: {
          DEFAULT: "#d3d1c7",
        },
        text: {
          DEFAULT: "#1a1a18",
          secondary: "#888780",
          tertiary: "#b4b2a9",
        },
        accent: {
          green: "#0F6E56",
          red: "#A32D2D",
          blue: "#378ADD",
          amber: "#EF9F27",
        },
        badge: {
          amber: "#FAEEDA",
          "amber-text": "#633806",
          red: "#FCEBEB",
          "red-text": "#791F1F",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      maxWidth: {
        container: "820px",
      },
    },
  },
  plugins: [],
};
