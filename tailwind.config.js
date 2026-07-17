/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'display': ['Anton', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)', // #F59E0B
          dark: '#D97706', // Amber 600
          light: '#FBBF24', // Amber 400
        },
        secondary: '#EF4444', // Red 500
        background: 'var(--color-background)', // Dynamic
        surface: 'var(--color-surface)',       // Dynamic
        text: {
          light: 'var(--color-text-main)',   // Dynamic Main Text
          dark: 'var(--color-text-muted)',   // Dynamic Muted Text
        }
      },
    },
  },
  plugins: [],
}
