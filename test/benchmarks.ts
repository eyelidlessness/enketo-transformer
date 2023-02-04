/* eslint-disable max-classes-per-file */
import * as core from '@actions/core';
import { performance } from 'perf_hooks';
import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
import { transform } from '../src/transformer';
import { fixtures } from './shared';

/** @see {@link https://stackoverflow.com/a/75007985} */
setFlagsFromString('--expose-gc');

const gc = runInNewContext('gc');

const benchmarkStart = performance.now();

const sortedFixtures = fixtures.slice().sort((A, B) => {
    const a = A.fileName.toLowerCase().replace(/.*\/([^/]+)$/, '$1');
    const b = B.fileName.toLowerCase().replace(/.*\/([^/]+)$/, '$1');

    if (a > b) {
        return 1;
    }

    return b > a ? -1 : 0;
});

const originPadWidth = Math.max(
    ...sortedFixtures.map(({ origin }) => origin.length)
);
const fileNamePadWidth = Math.max(
    ...sortedFixtures.map(({ fileName }) => fileName.length)
);

class Sample {
    constructor(readonly duration: number, readonly error: Error | null) {}
}

/**
 * T-Distribution two-tailed critical values for 95% confidence.
 * For more info see http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm.
 */
const tTable: Record<string, number> = {
    '1': 12.706,
    '2': 4.303,
    '3': 3.182,
    '4': 2.776,
    '5': 2.571,
    '6': 2.447,
    '7': 2.365,
    '8': 2.306,
    '9': 2.262,
    '10': 2.228,
    '11': 2.201,
    '12': 2.179,
    '13': 2.16,
    '14': 2.145,
    '15': 2.131,
    '16': 2.12,
    '17': 2.11,
    '18': 2.101,
    '19': 2.093,
    '20': 2.086,
    '21': 2.08,
    '22': 2.074,
    '23': 2.069,
    '24': 2.064,
    '25': 2.06,
    '26': 2.056,
    '27': 2.052,
    '28': 2.048,
    '29': 2.045,
    '30': 2.042,
    infinity: 1.96,
};

class TaskResult {
    samples: Sample[] = [];

    private json!: {
        readonly mean: number;
        readonly passed: boolean;
        readonly relativeMarginOfError: number;
    };

    label: string;

    constructor(readonly origin: string, readonly fileName: string) {
        this.label = `${origin.padEnd(originPadWidth)} | ${fileName.padEnd(
            fileNamePadWidth
        )}`;
    }

    get summary() {
        const { mean, relativeMarginOfError, passed } = this.toJSON();
        const emoji = passed ? '✅' : '❌';

        return [
            `${emoji} ${this.fileName}`,
            passed
                ? `${mean.toFixed(2)}ms \xb1${relativeMarginOfError.toFixed(
                      2
                  )}%`
                : '',
        ];
    }

    toJSON() {
        if (this.json != null) {
            return this.json;
        }

        const { samples } = this;
        const { length } = samples;
        const durations = samples.map(({ duration }) => duration);
        const mean =
            durations.reduce((acc, duration) => acc + duration, 0) / length;
        const degreesOfFreedom = length - 1;
        const variance =
            durations.reduce(
                (sum, duration) => sum + (duration - mean) ** 2,
                0
            ) / degreesOfFreedom;
        const stdDeviation = Math.sqrt(variance);
        const stdErrorOfMean = stdDeviation / Math.sqrt(length);
        const criticalValue =
            tTable[Math.round(degreesOfFreedom) || 1] ?? tTable.infinity;
        const marginOfError = stdErrorOfMean * criticalValue;
        const relativeMarginOfError = (marginOfError / mean) * 100 || 0;
        const passed = this.samples.every(({ error }) => error == null);

        this.json = {
            mean,
            passed,
            relativeMarginOfError,
        };

        return this.json;
    }

    toString() {
        const { mean, relativeMarginOfError } = this.toJSON();

        return `${this.label} | ${mean.toFixed(
            2
        )}ms \xb1${relativeMarginOfError.toFixed(2)}%`;
    }
}

const iterations = Array(10).fill(null);
const results: TaskResult[] = [];

// Warmup
await transform({ xform: sortedFixtures[0].xform });

let failed = false;

for await (const { fileName, origin, xform } of sortedFixtures) {
    gc();

    const result = new TaskResult(origin, fileName);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _iteration of iterations) {
        let caught: Error | null = null;

        const start = performance.now();

        try {
            await transform({ xform });
        } catch (error) {
            caught = error instanceof Error ? error : new Error(String(error));
            failed = true;
        }

        const duration = performance.now() - start;
        const sample = new Sample(duration, caught);

        result.samples.push(sample);
    }

    process.stdout.write(`${result.toString()}\n`);
    results.push(result);
}

if (failed) {
    process.exit(1);
}

const totalSeconds = (performance.now() - benchmarkStart) / 1000;
const average =
    results.reduce((acc, result) => {
        const { mean } = result.toJSON();

        return acc + mean;
    }, 0) / results.length;

const sorted = results.sort((resultA, resultB) => {
    const { mean: a } = resultA.toJSON();
    const { mean: b } = resultB.toJSON();

    return b - a;
});

const nonOutlierIndex =
    results.slice().findIndex((result, index) => {
        if (index === 0 || index > results.length - 2) {
            return false;
        }

        const { mean } = result.toJSON();
        const previous = results[index - 1].toJSON();
        const next = results[index + 1].toJSON();

        return (
            previous.mean / average > (mean / average) * 2 &&
            mean / average <= (next.mean / average) * 2
        );
    }) ?? 0;

const nonOutlierAverage =
    results.slice(nonOutlierIndex).reduce((acc, result) => {
        const { mean } = result.toJSON();

        return acc + mean;
    }, 0) / results.length;

process.stdout.write(`Average overall: ${average.toFixed(2)}ms\n`);
process.stdout.write(
    `Average without outliers: ${nonOutlierAverage.toFixed(2)}ms\n`
);
process.stdout.write(`Total runtime: ${totalSeconds.toFixed(2)}s\n`);

const [slowest] = sorted;
const fastest = sorted[sorted.length - 1];

if (process.env.GITHUB_STEP_SUMMARY) {
    const { summary } = core;

    summary.addHeading('Benchmarks', 1);

    const headings = [
        { data: 'Name', header: true },
        { data: 'Result', header: true },
    ];
    const collapseResults = results.length > 2;

    if (collapseResults) {
        summary.addTable([
            [{ data: '', header: true }, ...headings],
            ['Slowest', ...slowest.summary],
            ['Fastest', ...fastest.summary],
            [
                'Average overall',
                {
                    data: `${average.toFixed(2)}ms`,
                    colspan: String(headings.length),
                },
            ],
            [
                'Average without outliers',
                {
                    data: `${nonOutlierAverage.toFixed(2)}ms`,
                    colspan: String(headings.length),
                },
            ],
            [
                'Total runtime',
                {
                    data: `${totalSeconds.toFixed(2)}s`,
                    colspan: String(headings.length),
                },
            ],
        ]);
        summary.addRaw('<details><summary>All results</summary>');
    }

    summary.addTable([headings, ...results.map((task) => task.summary)]);

    if (collapseResults) {
        summary.addRaw('</details>');
    }

    await summary.write({ overwrite: true });
}

process.exit(0);
