import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        centro: {
          primary: "#004a59",
          ink: "#32373c",
          paper: "#ffffff"
        }
      },
      fontFamily: {
        sans: ["Roboto", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
