import { defineConfig } from 'vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [
    devvit({
      client: {
        build: {
          chunkSizeWarningLimit: 2000,
          // sourcemaps balloon the upload (10MB+) and playtest upload tokens
          // expire mid-transfer — don't ship them
          sourcemap: false,
        },
      },
    }),
  ],
});
