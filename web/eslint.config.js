// ESLint 9 flat config for the web package.
// Uses eslint-config-next/core-web-vitals which already ships as a flat-config
// array — no FlatCompat shim needed. The FlatCompat path tripped over a
// circular-reference in the next plugin export under ESLint 9.39.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/**', 'node_modules/**', '*.tsbuildinfo'] },
  ...nextCoreWebVitals,
];

export default config;
