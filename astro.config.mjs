// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // This prevents the "file does not exist" error by forcing Vite
      // to pre-bundle the compiler runtime correctly
      include: ['astro/compiler-runtime']
    }
  }
});