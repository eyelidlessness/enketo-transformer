/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../typings/libxmljs.d.ts" />

import type libxmljs from 'libxmljs';
import type { Document as XMLJSDocument } from 'libxmljs';
import { firefox as headless } from 'playwright';
import type { Page } from 'playwright';
import { createServer } from 'vite';
import {
    baseConfig,
    define,
    resolvePath,
    rootDir,
} from '../config/build.shared';
import '../index.html?raw';
import type { Survey as BaseSurvey, TransformedSurvey } from './transformer';

/**
 * @private
 *
 * There is no need to call this function, but it ensures that changes during
 * development are detected in dev/test watch mode
 */
export const recognizeDependencies = () => import.meta.glob('./**/*.{xsl,ts}');

let pagePromise: Promise<Page> | null = null;
let currentPage: Page | null = null;

const getPage = async () => {
    if (pagePromise != null) {
        currentPage = await pagePromise;

        return currentPage;
    }

    if (currentPage != null) {
        return currentPage;
    }

    const configFile = resolvePath('./vite.web.ts');

    try {
        const [browser, server] = await Promise.all([
            headless.launch({
                headless: true,
            }),
            createServer({
                configFile,
                mode: 'development',
                build: {
                    target: 'modules',
                },
                define,
                plugins: [...(baseConfig.plugins ?? [])],
                root: rootDir,
            }),
        ]);

        const [page] = await Promise.all([
            browser.newPage({
                bypassCSP: true,
                deviceScaleFactor: 0.01,
            }),
            server.listen(),
        ]);

        server.printUrls();

        process.once('beforeExit', async () =>
            Promise.all([browser.close(), server.close()])
        );

        if (server.resolvedUrls == null) {
            throw new Error('Server startup failed');
        }

        page.on('console', (message) => {
            console.log(message.text());
        });

        await page.goto(server.resolvedUrls.local[0], {
            waitUntil: 'load',
        });

        currentPage = page;

        await page.waitForLoadState('networkidle');

        const content = await page.content();

        await page.waitForFunction(() => enketo != null);

        if (!content.includes('Enketo Transformer')) {
            console.error(
                'Launching the browser bridge failed, got page content',
                content,
                'urls',
                server.resolvedUrls
            );
            process.exit(1);
        }

        return currentPage;
    } catch (error) {
        console.error('Launching the browser bridge failed, got error', error);

        process.exit(1);
    }
};

pagePromise = getPage();

type LibXMLJS = typeof libxmljs;

export type PreprocessFunction = (
    this: LibXMLJS,
    doc: XMLJSDocument
) => XMLJSDocument;

const legacyPreprocess = async (
    xform: string,
    preprocess: PreprocessFunction
) => {
    let libxmljs: LibXMLJS | null = null;

    try {
        libxmljs = await import('node1-libxmljsmt-myh');
    } catch {
        try {
            libxmljs = await import('libxmljs');
        } catch {
            throw new Error(
                'You must install `libxmljs` to use the `preprocess` option.'
            );
        }
    }

    const doc = libxmljs.parseXml(xform);
    const preprocessed = preprocess.call(libxmljs, doc);

    return preprocessed.toString(false);
};

export interface Survey extends Omit<BaseSurvey, 'preprocess'> {
    preprocess?: PreprocessFunction;
}

declare const enketo: {
    transformer: {
        transform: (survey: Survey) => Promise<TransformedSurvey>;
    };
};

export const transform = async (survey: Survey) => {
    const {
        preprocess,
        preprocessXForm,
        xform: baseXForm,
        ...options
    } = survey;

    let xform = baseXForm;

    if (typeof preprocess === 'function') {
        xform = await legacyPreprocess(xform, preprocess);
    }

    const page = await getPage();

    const result = await page.evaluate(
        /* eslint-disable @typescript-eslint/no-shadow */
        async ([input, preprocess]) => {
            const preprocessXForm =
                typeof preprocess === 'string'
                    ? (new Function(preprocess) as (xform: string) => any) // eslint-disable-line
                    : undefined;

            const browserResult = await enketo.transformer.transform({
                ...input,
                preprocessXForm,
            });

            return browserResult;
        },
        /* eslint-enable @typescript-eslint/no-shadow */

        [
            {
                ...options,
                xform,
            },
            typeof preprocessXForm === 'function'
                ? String(preprocessXForm)
                : null,
        ] as const
    );

    return result;
};

export type { TransformedSurvey } from './transformer';
