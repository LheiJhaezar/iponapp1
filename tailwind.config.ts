import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#16261f",
        inksoft: "#3c4d44",
        paper: "#f6f3ea",
        paperraised: "#fffdf7",
        jade: "#1f5d4c",
        jadedeep: "#143f34",
        sage: "#d7e4d5",
        sageline: "#b9cdb8",
        gold: "#e2a63f",
        golddeep: "#b9822a",
        coral: "#c85c46",
        coralsoft: "#f3ddd5",
        plum: "#6a4a7a",
        plumsoft: "#e6dcec",
        line: "#dcd6c4",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "18px" },
    },
  },
  plugins: [],
};
export default config;
