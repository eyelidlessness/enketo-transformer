import { transform } from '../src/transformer';

// import type { Survey as BridgeSurvey } from '../src/node';
import type { Survey } from '../src/transformer';

export const getXForm = async (fileName: string) => {
    let formPath: string;

    if (fileName.startsWith('/')) {
        formPath = fileName;
    } else if (fileName.startsWith('.')) {
        formPath = fileName;
        // formPath = await import.meta.resolve(fileName, './forms');
    } else {
        formPath = `./forms/${fileName}`;
    }

    const { default: xform } = await import(`${formPath}?import&raw`);

    return xform;
};

type GetTransformedFormOptions = Omit<Survey, 'xform'>;

export const getTransformedForm = async (
    fileName: string,
    options?: GetTransformedFormOptions
) => {
    const xform = await getXForm(fileName);

    return transform({
        ...options,
        xform,
    });
};

export const formImporters = import.meta.glob('../**/*.xml', {
    as: 'raw',
    eager: false,
});

type GetTransformedWebFormOptions = Omit<import('../src/node').Survey, 'xform'>;

export const getTransformedWebForm = async (
    formPath: string,
    options?: GetTransformedWebFormOptions
) => {
    const { transform } = await import('../src/node');
    const importPath = formPath.includes('/')
        ? formPath
        : `./forms/${formPath}`;
    const xform = await formImporters[importPath]();

    return transform({
        ...options,
        xform,
    });
};

export const getTransformedFormDocument = async (
    fileName: string,
    options?: GetTransformedFormOptions
) => {
    const { form } = await getTransformedForm(fileName, options);
    const parser = new DOMParser();

    return parser.parseFromString(form, 'text/html');
};

export const getTransformedModelDocument = async (
    fileName: string,
    options?: GetTransformedFormOptions
) => {
    const { model } = await getTransformedForm(fileName, options);
    const parser = new DOMParser();

    return parser.parseFromString(model, 'text/xml');
};

export * from '../src/dom';
