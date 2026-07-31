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
    optimizeDeps: {
      // MapLibre is imported only from a client <script> inside an .astro
      // component, which Vite's initial dependency scan does not reach. Left
      // to itself it discovers the package on the first map page load,
      // re-optimises mid-session and forces a reload — and the module request
      // already in flight comes back 504, so the map silently never
      // initialises. Naming it here gets it pre-bundled at server start.
      include: ['maplibre-gl'],
    },
  },
});
