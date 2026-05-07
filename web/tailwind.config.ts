import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { doctor:'#2563EB', nurse:'#059669', pharmacist:'#7C3AED', patient:'#D97706' },
        severity: { critical:'#DC2626', warning:'#F59E0B', info:'#3B82F6', positive:'#10B981' },
      },
    },
  },
  plugins: [],
};
export default config;
