import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { define } from '../config/build.shared';

const ENV = process.env.NODE_ENV ?? 'development';

const resolve =
    ENV === 'preview'
        ? {
              alias: {
                  'enketo-transformer/web': '../src/transformer.ts',
              },
          }
        : {};

const external = ['../src/api.ts', '../src/app.ts', '../src/node.ts'];

export default defineConfig({
    build: {
        rollupOptions: { external },
        target: 'esnext',
    },
    define,
    esbuild: { define },
    plugins: [solidPlugin()],
    resolve,
    server: {
        port: 3000,
    },
});
