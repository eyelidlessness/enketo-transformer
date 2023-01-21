import { parseHTML, parseXML, serializeXML } from './dom';
import { NAMESPACES, transform } from './transformer';
import { fixtures as baseFixtures } from '../test/shared';
import '../public/demo.css';

const fixtures = baseFixtures.sort((A, B) => {
    const a = A.fileName.toLowerCase().replace(/.*\/([^/]+)$/, '$1');
    const b = B.fileName.toLowerCase().replace(/.*\/([^/]+)$/, '$1');

    if (a > b) {
        return 1;
    }

    return b > a ? -1 : 0;
});

const initDemo = async () => {
    document.body.insertAdjacentHTML(
        'beforeend',
        /* html */ `
        <div id="app">
            <h1><a href="/">Enketo Transformer Demo</a></h1>

            <form id="demo">
                <p>
                    <select id="forms">
                        <option value="" selected disabled>
                            Choose a form…
                        </option>
                        ${fixtures.map(
                            ({ fileName }, index) =>
                                `<option value="${index}" data-file-name="${fileName}">${fileName}</option>`
                        )}
                    </select>
                </p>

                <p id="transform-options">
                    <label>
                        <input type="checkbox" id="logo" /> Logo
                    </label>

                    <label>
                        <input type="checkbox" id="openclinica" /> OpenClinica
                    </label>

                    <label>
                        <input type="checkbox" id="markdown" /> Markdown
                    </label>

                    <label>
                        <input type="checkbox" id="preprocess" /> Preprocess
                    </label>

                    <label>
                        <input type="checkbox" id="theme" /> Theme
                    </label>
                </p>
            </form>

            <div id="error" style="display: none">
                <h2>Error</h2>

                <pre id="dump"></pre>
            </div>

            <div id="result" style="display: none">
                <div id="metrics"></div>

                <details>
                    <summary>XForm</summary>
                    <pre id="xform"></pre>
                </details>

                <div id="form-rendered"></div>
                <details>
                    <summary>Form HTML</summary>
                    <pre id="form-source"></pre>
                </details>

                <h3>Model</h3>
                <pre id="model"></pre>

                <h3>Data</h3>
                <pre id="data"></pre>
            </div>
        </div>`
    );

    const demoForm = document.querySelector('#demo') as HTMLFormElement;
    const metrics = document.querySelector('#metrics') as HTMLElement;
    const select = document.querySelector('#forms') as HTMLSelectElement;
    const logo = document.querySelector('#logo') as HTMLInputElement;
    const openclinica = document.querySelector(
        '#openclinica'
    ) as HTMLInputElement;
    const markdown = document.querySelector('#markdown') as HTMLInputElement;
    const preprocess = document.querySelector(
        '#preprocess'
    ) as HTMLInputElement;
    const theme = document.querySelector('#theme') as HTMLInputElement;
    const errorContainer = document.querySelector('#error') as HTMLElement;
    const resultContainer = document.querySelector('#result') as HTMLElement;
    const xformContainer = document.querySelector('#xform') as HTMLDivElement;
    const errorDump = document.querySelector('#dump') as HTMLPreElement;
    const formOutput = document.querySelector('#form-source') as HTMLPreElement;
    const formRendered = document.querySelector(
        '#form-rendered'
    ) as HTMLPreElement;
    const modelOutput = document.querySelector('#model') as HTMLPreElement;
    const dataOutput = document.querySelector('#data') as HTMLPreElement;
    const details = [...document.querySelectorAll('details')];

    const preprocessXForm = (xform: string) => {
        const doc = parseXML(xform);
        const prefix = doc.lookupPrefix(NAMESPACES.xmlns);
        const el = doc.createElementNS(NAMESPACES.xmlns, `${prefix}:instance`);

        el.id = 'preprocessed';

        doc.querySelector(
            ':root > head > model > instance'
        )?.insertAdjacentElement('afterend', el);

        return serializeXML(doc);
    };

    let isHashChange = false;

    const setHash = (fileName: string, options: any = {}) => {
        if (isHashChange) {
            return;
        }

        const url = new URL(window.location.href);

        // This is more consistent with the dev API equivalent
        url.searchParams.set('xform', fileName);

        Object.entries({
            logo: true,
            openclinica: 0,
            markdown: true,
            preprocess: false,
            preprocessXForm: false,
            ...options,
        }).forEach(([key, value]) => {
            if (value != null && value !== '') {
                const paramKey = key === 'preprocessXForm' ? 'preprocess' : key;

                const paramValue =
                    paramKey === 'preprocess' ? String(value) : String(value);

                url.searchParams.set(paramKey, String(paramValue));
            }
        });

        if (url.search !== window.location.search) {
            window.location.hash = url.search;
        }
    };

    const setFormStateFromHash = () => {
        const options = new URL(
            `/${window.location.hash.replace('#', '')}`,
            window.location.href
        ).searchParams;
        const selectedForm = options.get('xform');

        if (selectedForm != null) {
            const option = select.querySelector<HTMLOptionElement>(
                `option[data-file-name="${CSS.escape(selectedForm)}"]`
            );

            if (option != null) {
                option.selected = true;
            }
        }

        logo.checked = options.get('logo') === 'true';
        openclinica.checked = Number(options.get('openclinica')) === 1;
        markdown.checked = options.get('markdown') !== 'false';
        preprocess.checked = options.get('preprocess') === 'true';
        theme.checked = options.get('theme') === 'true';

        if (selectedForm) {
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    demoForm.addEventListener('change', async () => {
        const { value } = select;
        const fileName = select.querySelector<HTMLOptionElement>(
            `option[value="${CSS.escape(value)}"]`
        )?.dataset.fileName;
        const fixture = fixtures[Number(value)];

        if (fileName == null || fixture == null) {
            return;
        }

        const { xform } = fixture;

        xformContainer.innerText = xform;

        resultContainer.style.display = 'none';
        errorContainer.style.display = 'none';

        errorDump.innerText = '';
        formOutput.innerText = '';
        formRendered.innerHTML = '';
        modelOutput.innerText = '';
        dataOutput.innerText = '';
        details.forEach((element) => {
            element.open = false;
        });

        setTimeout(async () => {
            try {
                resultContainer.style.display = 'block';

                const startTime = performance.now();
                const options = {
                    logo: logo.checked,
                    openclinica: openclinica.checked ? 1 : 0,
                    markdown: markdown.checked,
                    preprocessXForm: preprocess.checked
                        ? preprocessXForm
                        : undefined,
                    theme: theme.checked ? 'mytheme' : '',
                };
                setHash(fileName, {
                    ...options,
                    preprocessXForm: preprocess.checked,
                    theme: theme.checked,
                });
                const result = await transform({
                    ...options,
                    media: options.logo ? { 'form_logo.png': '/icon.png' } : {},
                    xform,
                });
                const transformTime = (performance.now() - startTime).toFixed(
                    2
                );

                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- it has to be there if the transform succeeded
                const form = parseHTML(result.form).querySelector(
                    ':root > body > form.or'
                )!;
                const model = parseXML(result.model);

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { form: _form, model: _model, ...rest } = result;
                const data = JSON.stringify(rest, null, 4);

                metrics.textContent = `Time to transform: ${transformTime} ms`;
                formOutput.innerText = form.outerHTML;
                formRendered.append(form);
                modelOutput.innerText = model.documentElement.outerHTML;
                dataOutput.innerText = data;
            } catch (error) {
                errorContainer.style.display = 'block';

                const { stack, message } = error as Error;

                errorDump.innerText = `${message}\n${stack}`;
            }
        }, 10);
    });

    setFormStateFromHash();

    preprocess.addEventListener('change', (event) => {
        console.log('wat', event);
    });

    window.addEventListener('hashchange', () => {
        isHashChange = true;

        setTimeout(() => {
            setFormStateFromHash();

            setTimeout(() => {
                isHashChange = false;
            });
        });
    });

    setTimeout(() => {
        select.focus();
    });
};

initDemo();
