import { Suite } from 'benchmark';
import type Benchmark from 'benchmark';
import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
import { writeFileSync } from 'fs';
import { transform } from '../src/transformer';
import { fixtures } from './shared';

/**
 * @see {@link https://stackoverflow.com/a/75007985}
 *
 * We manually invoke the garbage collector after each cycle on each form, to
 * minimize its impact on margin of error.
 */
const gc: () => void = (() => {
    setFlagsFromString('--expose-gc');

    return runInNewContext('gc');
})();

const origins = new Set(fixtures.map(({ origin }) => origin));

const options = {
    delay: 0.05,
    maxTime: 1,
    minSamples: 5,
    minTime: 0.25,
} satisfies Benchmark.Options;

const suites = new Map<string, Suite>(
    [...origins].map((origin) => [origin, new Suite(origin)])
);

interface ExplicitToString {
    toString(): string;
}

const writeStdout = (value: string | ExplicitToString) =>
    new Promise<void>((resolve, reject) => {
        process.stdout.write(String(value), (error) => {
            if (error == null) {
                resolve();
            } else {
                reject(error);
            }
        });
    });

fixtures.forEach(({ fileName, origin, xform }) => {
    const suite = suites.get(origin)!;

    suite.add(
        fileName,
        async (deferred: Benchmark.Deferred) => {
            await transform({ xform });
            deferred.resolve();
        },
        {
            ...options,
            async: true,
            defer: true,
            onStart: () => {
                gc();
            },
            onCycle: () => {
                gc();
            },
        }
    );
});

const runSuite = async (suite: Suite) =>
    new Promise((resolve) => {
        suite.on('cycle', async (event: Event) => {
            await writeStdout(`${event.target}\n`);
        });
        suite.on('complete', resolve);
        suite.run({ async: true });
    });

for await (const suite of suites.values()) {
    await runSuite(suite);
}

const { GITHUB_STEP_SUMMARY } = process.env;

if (GITHUB_STEP_SUMMARY) {
    const sum = (ns: number[]) => ns.reduce((acc, n) => acc + n, 0);
    const avg = (ns: number[]) => sum(ns) / ns.length;

    const benchmarks = [...suites.values()]
        .flatMap((suite): Benchmark[] => suite.slice(0, suite.length))
        .sort((a, b) => a.hz - b.hz);

    const times = benchmarks.map(({ times }) => times!.elapsed);
    const time = sum(times).toFixed(2);
    const means = benchmarks.map(({ stats }) => stats.mean * 1000);
    const average = avg(means);
    const nonOutlierIndex = Math.max(
        means.findIndex((mean, index) => {
            if (index === 0 || index > means.length - 2) {
                return false;
            }

            const previous = means[index - 1];
            const next = means[index + 1];

            return (
                previous / average > (mean / average) * 2 &&
                mean / average <= (next / average) * 2
            );
        }),
        0
    );
    const averageWithoutOutliers = avg(means.slice(nonOutlierIndex));

    /**
     * Roughly based on {@link https://github.com/bestiejs/benchmark.js/blob/42f3b732bac3640eddb3ae5f50e445f3141016fd/benchmark.js#L1525}, simplified and modified to output a GitHub Actions summary.
     */
    const summaries = benchmarks.map((bench, index) => {
        const { error, name, stats } = bench;
        let result = error?.message;

        if (result == null) {
            const size = stats.sample.length;
            const pm = '\xb1';
            const mean = `${means[index].toFixed(2)} ms`;

            const [hzWhole, hzFractional] = String(
                bench.hz.toFixed(bench.hz < 100 ? 2 : 0)
            ).split('.');
            const hz =
                hzWhole.replace(/(?=(?:\d{3})+$)(?!\b)/g, ',') +
                (hzFractional ? `.${hzFractional}` : '');
            const rme = `${pm} ${stats.rme.toFixed(2)}%`;
            const samples = `${size} run${size === 1 ? '' : 's'}`;

            result = `${mean} ${rme} (${hz} ops/s, ${samples})`;
        }

        return [name, result];
    });
    const [slowest] = summaries;
    const fastest = summaries[summaries.length - 1];

    const summary = /* html */ `
        <h1>Benchmarks</h1>

        <table>
            <tr>
                <th></th>
                <th>Name</th>
                <th>Result</th>
            </tr>
            <tr>
                <td>Slowest</td>
                <td>${slowest[0]}</td>
                <td>${slowest[1]}</td>
            </tr>
            <tr>
                <td>Fastest</td>
                <td>${fastest[0]}</td>
                <td>${fastest[1]}</td>
            </tr>
            <tr>
                <td>Average overall</td>
                <td colspan="2">${average.toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Average without outliers</td>
                <td colspan="2">${averageWithoutOutliers.toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Total runtime</td>
                <td colspan="2">${time}s</td>
            </tr>
        </table>

        <details>
            <summary>All results</summary>

            <table>
                <tr>
                    <th>Name</th>
                    <th>Result</th>
                </tr>
                ${summaries
                    .map(
                        ([name, result]) =>
                            /* html */ `<tr><td>${name}</td><td>${result}</td></tr>`
                    )
                    .join('\n')}
            </table>
        </details>
    `
        .trim()
        .replace(/(^|\n)\s+/g, '$1');

    writeFileSync(GITHUB_STEP_SUMMARY, summary);
}
