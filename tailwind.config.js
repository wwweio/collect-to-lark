/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAF8',
        surface: '#FFFFFF',
        border: '#E8E6E3',
        text: '#1A1A1A',
        muted: '#78716C',
        accent: '#0D7377',
        'accent-hover': '#0A5F62',
        amber: '#D97706',
        success: '#16A34A',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
