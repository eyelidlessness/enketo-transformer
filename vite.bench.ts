import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { baseConfig, external } from './config/build.shared';
import { VitestGithubActionsReporter } from './tools/reporters/vitest/github-actions';

export default defineConfig({
    ...baseConfig,

    build: {
        ...baseConfig.build,

        lib: {
            entry: resolve(__dirname, './src/transformer.ts'),
            name: 'enketo-transformer',
        },
        minify: false,
        outDir: 'dist',
        rollupOptions: {
            external,
            output: {
                // This suppresses a warning for modules with both named and
                // default exporrs when building for CommonJS (UMD in our
                // current build). It's safe to suppress this warning because we
                // have explicit tests ensuring both the default and named
                // exports are consistent with the existing public API.
                exports: 'named',
            },
        },
        sourcemap: true,
    },
    mode: 'bench',
    optimizeDeps: {
        disabled: true,
    },
    ssr: {
        target: 'node',
    },
    test: {
        // Vitest uses thread-based concurrency by defualt.
        // While this would significantly improve the speed
        // of test runs, native Node extensions using N-API
        // are often not thread safe. In this case, that
        // means we cannot use concurrency for testing
        // functionality which depends on libxmljs/libxslt.
        threads: false,

        benchmark: {
            include: ['test/benchmarks.ts'],
            reporters: ['default', new VitestGithubActionsReporter()],
        },
        include: [],
        isolate: true,
        globals: true,
        passWithNoTests: true,
        sequence: { shuffle: false },
    },
});
