/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#00a6c7',
          600: '#008da9',
          700: '#00738a',
          900: '#17202b',
        },
      },
    },
  },
  plugins: [],
};
