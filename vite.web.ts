import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';
import { baseConfig, define as baseDefine } from './config/build.shared';

const ENV = process.env.NODE_ENV === 'test' ? 'test' : 'web';

const define = {
    ...baseDefine,
    ENV: JSON.stringify(ENV),
};

export const config: UserConfig = {
    ...baseConfig,

    define,

    esbuild: {
        define,
        sourcemap: true,
    },

    test: {
        globals: true,
    },
};

export default defineConfig(config);
