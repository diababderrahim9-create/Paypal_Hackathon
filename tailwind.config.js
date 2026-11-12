/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./frontend/index.html', './frontend/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        warden: {
          navy: '#101722',
          slate: '#1E2631',
          steel: '#6C8CA1',
          muted: '#8FA3B0',
          ivory: '#EBE8E0',
          dark: '#0A0F16',
          card: '#121A24',
          cardHover: '#162230',
          border: '#223041',
          borderLight: '#2C3E54',
          surface: '#151F2C',
        },
        ink: '#0B1017',
        panel: '#101722',
        line: '#1E2631',
        mint: '#10B981',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.45)',
        'panel-lg': '0 10px 30px -5px rgba(0, 0, 0, 0.65)',
        'glow-mint': '0 0 20px -3px rgba(16, 185, 129, 0.35)',
        'glow-blue': '0 0 20px -3px rgba(108, 140, 161, 0.35)',
        'glow-red': '0 0 20px -3px rgba(239, 68, 68, 0.35)',
      },
    },
  },
  plugins: [],
};
