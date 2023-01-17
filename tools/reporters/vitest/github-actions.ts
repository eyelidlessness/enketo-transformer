import * as core from '@actions/core';
import { relative, resolve } from 'path';
import type {
    Benchmark,
    BenchmarkResult,
    File,
    Reporter,
    TaskResult,
    Vitest,
} from 'vitest';

interface FinishedTaskResult extends TaskResult {
    duration: number;
}

interface FinishedBenchmarkTask extends Benchmark {
    result: TaskResult & {
        benchmark: BenchmarkResult;
    };
}

interface FinishedBenchmarkFile extends File {
    result: FinishedTaskResult;
    tasks: FinishedBenchmarkTask[];
}

/* eslint-disable class-methods-use-this */
export class VitestGithubActionsReporter implements Reporter {
    context!: Vitest;

    onInit(context: Vitest) {
        this.context = context;
    }

    async onFinished(files: File[] = []) {
        if (process.env.GITHUB_STEP_SUMMARY == null) {
            console.info(
                'GitHub Actions summary not supported in this environment'
            );

            return;
        }

        const benchmarkReuslts = files
            .map((file) => ({
                ...file,
                tasks: file.tasks
                    .filter(
                        (task): task is FinishedBenchmarkTask =>
                            task.type === 'benchmark' && task.result != null
                    )
                    .sort((a, b) => {
                        const aFailed = a.result.state !== 'pass';
                        const bFailed = b.result.state !== 'pass';
                        if (aFailed || bFailed) {
                            if (aFailed === bFailed) {
                                return 0;
                            }

                            return aFailed ? 1 : -1;
                        }

                        return (
                            b.result.benchmark.totalTime -
                            a.result.benchmark.totalTime
                        );
                    }),
            }))
            .filter(
                (file): file is FinishedBenchmarkFile => file.tasks.length > 0
            )
            .sort((a, b) => b.result.duration - a.result.duration);

        if (benchmarkReuslts.length === 0) {
            return;
        }

        const { summary } = core;

        summary.addHeading('Benchmarks', 1);

        const taskRow = ({ name, result }: FinishedBenchmarkTask) => {
            const passed = result.state === 'pass';
            const { mean, rme, samples } = result.benchmark;

            return [
                passed ? '✅' : '❌',
                name,
                passed ? `${mean.toFixed(2)} ms (±${rme.toFixed(2)}%)` : '',
                passed ? `${samples.length}` : '',
            ];
        };

        benchmarkReuslts.forEach(({ filepath, tasks }) => {
            const relativePath = relative(
                resolve(process.cwd(), './test'),
                filepath
            ).replace(/^\.\//, '');

            const [slowest] = tasks;
            const fastest = tasks[tasks.length - 1];

            const headings = [
                { data: 'Pass', header: true },
                { data: 'Name', header: true },
                { data: 'Result', header: true },
                { data: 'Samples', header: true },
            ];

            summary.addHeading(relativePath, 2);

            if (slowest.result.state === 'pass') {
                summary.addRaw('Slowest:');
                summary.addBreak();
                summary.addBreak();
                summary.addTable([headings, taskRow(slowest)]);
            }

            if (tasks.length > 1) {
                summary.addRaw('Fastest:');
                summary.addBreak();
                summary.addBreak();
                summary.addTable([headings, taskRow(fastest)]);

                summary.addRaw('<details><summary>All results</summary>');
                summary.addTable([headings, ...tasks.map(taskRow)]);
                summary.addRaw('</details>');
            }
        });

        await summary.write({
            overwrite: false,
        });
    }
}
