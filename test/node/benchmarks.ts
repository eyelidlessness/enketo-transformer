import { basename } from 'path';
import { bench } from 'vitest';
import { transform } from '../../src/node';

const xforms = await Promise.all(
    Object.entries(
        import.meta.glob('../**/*.xml', {
            as: 'raw',
            eager: false,
        })
    ).map(async ([path, importXForm]) => {
        const xform = await importXForm();
        const project =
            path.match(/\/external-fixtures\/([^/]+)/)?.[1] ??
            'enketo-transformer';
        const fileName = basename(path);

        return {
            fileName,
            project,
            xform,
        };
    })
);

xforms.forEach(({ fileName, project, xform }) => {
    bench(
        `Transform ${project} ${fileName}`,
        async () => {
            await transform({ xform });
        },
        {
            time: 2000,
        }
    );
});
