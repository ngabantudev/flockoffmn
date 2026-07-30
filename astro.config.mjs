// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static output on purpose. Per the product spec the v1 site has no backend,
// no database, and no user records — which also makes it cheap to mirror and
// hard to take down if the project draws legal pressure (see docs/DEPLOYMENT.md).
export default defineConfig({
  site: 'https://example.org',
  output: 'static',
  trailingSlash: 'never',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
