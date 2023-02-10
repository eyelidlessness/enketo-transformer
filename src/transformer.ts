// /// <reference lib="dom" />
// /// <reference lib="dom.iterable" />

import crypto from 'crypto';
import libxslt from 'libxslt';
import type { Document as XMLJSDocument } from 'libxmljs';
import pkg from '../package.json';
import {
    cleanCaches,
    DOMParser,
    Element,
    getNodesByXPathExpression,
    NAMESPACES,
    preprocessXForm,
    XMLDocument,
    XSLTProcessor,
} from './dom';
import xslForm from './xsl/openrosa2html5form.xsl?raw';
import xslModel from './xsl/openrosa2xmlmodel.xsl?raw';
import { parseLanguage } from './language';
import { markdownToHTML } from './markdown';
import { escapeURLPath, getMediaPath } from './url';
// import { DOMMimeType } from './dom/shared';

// declare global {
//     interface DOMParser {
//         parseFromString<T extends DOMMimeType>(
//             str: string,
//             mimeType: T
//         ): T extends 'text/xml' ? XMLDocument : Document;
//     }

//     const getNodesByXPathExpression: (
//         doc: Document,
//         expression: string,
//         context?: Document | Element | DocumentFragment
//     ) => Element[];

//     const preprocessXForm:
//         | ((
//               preprocess: (...args: any[]) => any,
//               xmlDocument: XMLDocument
//           ) => XMLDocument)
//         | undefined;
// }

const { libxmljs } = libxslt;

/** @private */
export const getNode = () => import.meta.glob('./dom/**/*.ts');

type LibXMLJS = typeof libxmljs;

export type TransformPreprocess = (
    this: LibXMLJS,
    doc: XMLJSDocument
) => XMLJSDocument;

export interface Survey {
    xform: string;
    markdown?: boolean;
    media?: Record<string, string>;
    openclinica?: boolean | number;
    preprocess?: TransformPreprocess;
    theme?: string;
}

export interface TransformedSurvey {
    form: string;
    languageMap: Record<string, string>;
    model: string;
    transformerVersion: string;
}

let activeTransforms = 0;

/**
 * Performs XSLT transformation on XForm and process the result.
 */
export const transform = async <T extends Survey>(
    survey: T
): Promise<TransformedSurvey & Omit<T, keyof Survey>> => {
    activeTransforms += 1;

    const { xform, markdown, media, openclinica, preprocess, theme } = survey;

    const xsltParams = openclinica
        ? {
              openclinica: 1,
          }
        : {};

    const mediaMap = Object.fromEntries(
        Object.entries(media || {}).map((entry) => entry.map(escapeURLPath))
    );

    const doc = parser.parseFromString(xform, 'text/xml');
    const xformDoc =
        typeof preprocess === 'function' &&
        typeof preprocessXForm === 'function'
            ? preprocessXForm(preprocess, doc)
            : doc;

    processBinaryDefaults(xformDoc, mediaMap);

    const htmlDoc = xslTransform(xslForm, xformDoc, xsltParams);

    correctAction(htmlDoc, 'setgeopoint');
    correctAction(htmlDoc, 'setvalue');
    replaceTheme(htmlDoc, theme);
    replaceMediaSources(htmlDoc, mediaMap);

    const languageMap = replaceLanguageTags(htmlDoc);
    const form =
        markdown !== false
            ? renderMarkdown(htmlDoc, mediaMap)
            : docToString(htmlDoc, 'text/html');
    const xmlDoc = xslTransform(xslModel, xformDoc);

    replaceMediaSources(xmlDoc, mediaMap);
    addInstanceIdNodeIfMissing(xmlDoc);

    const model = docToString(xmlDoc);

    // @ts-expect-error - This fails because `xform` is not optional, but this is API-consistent behavior.
    delete survey.xform;
    delete survey.media;
    delete survey.preprocess;
    delete survey.markdown;
    delete survey.openclinica;

    activeTransforms -= 1;

    setImmediate(() => {
        if (activeTransforms === 0) {
            cleanCaches();
        }
    });

    return Object.assign(survey, {
        form,
        model,
        languageMap,
        transformerVersion: PACKAGE_VERSION,
    });
};

interface XSLTParams {
    openclinica?: number;
}

const parser = new DOMParser();

const xslTransform = (
    xslStr: string,
    xmlDoc: XMLDocument,
    xsltParams: XSLTParams = {} as XSLTParams
) => {
    const xsltProcessor = new XSLTProcessor();
    const xslDoc = parser.parseFromString(xslStr, 'text/xml');

    xsltProcessor.importStylesheet(xslDoc);

    Object.entries(xsltParams).forEach(([key, value]) => {
        xsltProcessor.setParameter(null, key, value);
    });

    const output = xmlDoc.implementation.createDocument(
        NAMESPACES.xmlns,
        `root`
    );
    const fragment = xsltProcessor.transformToFragment(xmlDoc, output);

    fragment.childNodes.forEach((child) => {
        output.documentElement.appendChild(child);
    });

    return output;
};

const processBinaryDefaults = (
    doc: XMLDocument,
    mediaMap: Record<string, string>
) => {
    getNodesByXPathExpression(
        doc,
        '/h:html/h:head/xmlns:model/xmlns:bind[@type="binary"]'
    ).forEach((bind) => {
        const nodeset = bind.getAttribute('nodeset');

        if (nodeset != null) {
            const path = `/h:html/h:head/xmlns:model/xmlns:instance${nodeset.replace(
                /\//g,
                '/xmlns:'
            )}`;
            const [dataNode] = getNodesByXPathExpression(doc, path);

            if (dataNode != null) {
                const text = dataNode.textContent ?? '';

                // Very crude URL checker which is fine for now,
                // because at this point we don't expect anything other than jr://
                if (/^[a-zA-Z]+:\/\//.test(text)) {
                    const value = getMediaPath(mediaMap, text);
                    const escapedText = escapeURLPath(text);

                    dataNode.setAttribute('src', value);
                    dataNode.textContent = escapedText;
                }
            }
        }
    });
};

/**
 * Correct some <setvalue>/<odk:setgeopoint> issues in the XSL stylesheets.
 * This is much easier to correct in javascript than in XSLT
 */
const correctAction = (
    doc: XMLDocument,
    localName: 'setvalue' | 'setgeopoint' = 'setvalue'
) => {
    /*
     * See setvalue.xml (/data/person/age_changed). A <setvalue> inside a form control results
     * in one label.question with a nested label.setvalue which is weird syntax (and possibly invalid HTML).
     */
    getNodesByXPathExpression(
        doc,
        `//*[contains(@class, "question")]//label/input[@data-${localName}]`
    ).forEach((setValueEl) => {
        const { parentElement } = setValueEl;

        parentElement?.replaceWith(setValueEl);
    });

    /*
     * See setvalue.xml (/data/person/age). A <setvalue> inside a repeat to set a default value that also has a question with the same name, results
     * in one .question and .setvalue with the same name, which will leads to all kinds of problems in enketo-core
     * as name is presumed to be unique.
     *
     * Note that a label.setvalue is always to set a default value (with odk-new-repeat, odk-instance-first-load), never
     * a value change directive (with xforms-value-changed)
     */
    getNodesByXPathExpression(
        doc,
        `//label[contains(@class, "${localName}")]/input[@data-${localName}]`
    ).forEach((setValueEl) => {
        const name = setValueEl.getAttribute('name');
        const [questionSameName] = getNodesByXPathExpression(
            doc,
            `//*[@name="${name}" and ( contains(../@class, 'question') or contains(../../@class, 'option-wrapper')) and not(@type='hidden')]`
        );
        if (questionSameName) {
            // Note that if the question has radiobuttons or checkboxes only the first of those gets the setvalue attributes.
            [`data-${localName}`, 'data-event'].forEach((name) => {
                questionSameName.setAttribute(
                    name,
                    setValueEl.getAttribute(name) ?? name
                );
            });

            setValueEl.parentElement?.remove();
        }
    });
};

const HAS_THEME = /(theme-)[^"'\s]+/;

const replaceTheme = (doc: XMLDocument, theme?: string) => {
    if (!theme) {
        return;
    }

    const [form] = getNodesByXPathExpression(doc, '/xmlns:root/form');
    const classes = [...form.classList.values()];
    const current = classes.find((item) => HAS_THEME.test(item));
    const themeClass = `theme-${theme}`;

    if (current == null) {
        form.classList.add(themeClass);
    } else {
        form.classList.replace(current, themeClass);
    }
};

const replaceMediaSources = <T extends XMLDocument | Element>(
    root: T,
    mediaMap?: Record<string, string>
) => {
    if (!mediaMap || root.ownerDocument == null) {
        return;
    }

    // iterate through each element with a src attribute
    getNodesByXPathExpression(
        root.ownerDocument,
        '//*[@src] | //a[@href]',
        root
    ).forEach((mediaEl) => {
        const attribute =
            mediaEl.nodeName.toLowerCase() === 'a' ? 'href' : 'src';
        const src = mediaEl.getAttribute(attribute);

        if (src == null) {
            return;
        }

        const replacement = getMediaPath(mediaMap, src);

        if (replacement) {
            mediaEl.setAttribute(attribute, replacement);
        }
    });

    // add form logo <img> element if applicable
    const formLogo = mediaMap['form_logo.png'];
    const [formLogoEl] = getNodesByXPathExpression(
        root.ownerDocument,
        '//*[@class="form-logo"]',
        root
    );
    if (formLogo && formLogoEl) {
        const { ownerDocument } = root;
        const img = ownerDocument.createElement('img');

        img.setAttribute('src', formLogo);
        img.setAttribute('alt', 'form logo');
        formLogoEl.appendChild(img);
    }
};

/**
 * Replaces all lang attributes to the valid IANA tag if found.
 * Also add the dir attribute to the languages in the language selector.
 *
 * @see http://www.w3.org/International/questions/qa-choosing-language-tags
 */
const replaceLanguageTags = (doc: XMLDocument) => {
    const languageMap: Record<string, string> = {};

    const languageElements = getNodesByXPathExpression(
        doc,
        '/xmlns:root/form/select[@id="form-languages"]/option'
    );

    // List of parsed language objects
    const languages = languageElements.map((el) => {
        const lang = el.textContent ?? '';

        return parseLanguage(lang, getLanguageSampleText(doc, lang));
    });

    // forms without itext and only one language, still need directionality info
    if (languages.length === 0) {
        languages.push(parseLanguage('', getLanguageSampleText(doc, '')));
    }

    // add or correct dir and value attributes, and amend textcontent of options in language selector
    languageElements.forEach((el, index) => {
        const val = el.getAttribute('value');
        if (val && val !== languages[index].tag) {
            languageMap[val] = languages[index].tag;
        }
        el.setAttribute('data-dir', languages[index].directionality);
        el.setAttribute('value', languages[index].tag);
        el.textContent = languages[index].description;
    });

    // correct lang attributes
    languages.forEach(({ sourceLanguage, tag }) => {
        if (sourceLanguage === tag) {
            return;
        }
        getNodesByXPathExpression(
            doc,
            `/xmlns:root/form//*[@lang="${sourceLanguage}"]`
        ).forEach((el) => {
            el.setAttribute('lang', tag);
        });
    });

    // correct default lang attribute
    const [langSelectorElement] = getNodesByXPathExpression(
        doc,
        '/xmlns:root/form/*[@data-default-lang]'
    );
    if (langSelectorElement) {
        const defaultLang =
            langSelectorElement.getAttribute('data-default-lang');
        languages.some(({ sourceLanguage, tag }) => {
            if (sourceLanguage === defaultLang) {
                langSelectorElement.setAttribute('data-default-lang', tag);

                return true;
            }

            return false;
        });
    }

    return languageMap;
};

/**
 * Obtains a non-empty hint text or other text sample of a particular form language.
 */
const getLanguageSampleText = (doc: XMLDocument, language: string) => {
    // First find non-empty text content of a hint with that lang attribute.
    // If not found, find any span with that lang attribute.
    const langSampleEl =
        getNodesByXPathExpression(
            doc,
            `/xmlns:root/form//span[contains(@class, "or-hint") and @lang="${language}" and normalize-space() and not(./text() = '-')]`
        )?.[0] ||
        getNodesByXPathExpression(
            doc,
            `/xmlns:root/form//span[@lang="${language}" and normalize-space() and not(./text() = '-')]`
        )?.[0];

    return langSampleEl?.textContent?.trim() || 'nothing';
};

/**
 * Temporary function to add a /meta/instanceID node if this is missing.
 * This used to be done in enketo-xslt but was removed when support for namespaces was added.
 */
const addInstanceIdNodeIfMissing = (doc: XMLDocument) => {
    const xformsPath =
        '/xmlns:root/xmlns:model/xmlns:instance/*/xmlns:meta/xmlns:instanceID';
    const openrosaPath =
        '/xmlns:root/xmlns:model/xmlns:instance/*/orx:meta/orx:instanceID';
    const [instanceIdEl] = getNodesByXPathExpression(
        doc,
        `${xformsPath} | ${openrosaPath}`
    );

    if (!instanceIdEl) {
        const [rootEl] = getNodesByXPathExpression(
            doc,
            '/xmlns:root/xmlns:model/xmlns:instance/*'
        );
        let [metaEl] = getNodesByXPathExpression(
            doc,
            '/xmlns:root/xmlns:model/xmlns:instance/*/xmlns:meta'
        );

        if (metaEl == null) {
            metaEl = doc.createElement('meta');

            rootEl.appendChild(metaEl);
        }

        const instanceID = doc.createElement('instanceID');

        metaEl.appendChild(instanceID);
    }
};

/**
 * Converts a subset of Markdown in all textnode children of labels and hints into HTML
 */
const renderMarkdown = (
    htmlDoc: XMLDocument,
    mediaMap: Record<string, string>
) => {
    const replacements: Record<string, string> = {};

    // First turn all outputs into text so *<span class="or-output></span>* can be detected
    getNodesByXPathExpression(
        htmlDoc,
        '/xmlns:root/form//span[contains(@class, "or-output")]'
    ).forEach((el, index) => {
        const key = `---output-${index}`;
        const textNode = el.childNodes[0].cloneNode(true);
        replacements[key] = el.outerHTML;
        textNode.textContent = key;
        el.replaceWith(textNode);
        // Note that we end up in a situation where we likely have sibling text nodes...
    });

    // Now render markdown
    getNodesByXPathExpression(
        htmlDoc,
        '/xmlns:root/form//span[contains(@class, "question-label") or contains(@class, "or-hint")]'
    ).forEach((el, index) => {
        let key;
        /**
         * Using text() is done because:
         * a) We are certain that these <span>s do not contain other elements, other than formatting/markdown <span>s.
         * b) This avoids the need to merge any sibling text nodes that could have been created in the previous step.
         *
         * Note that text() will convert &gt; to >
         */
        const original = (el.textContent ?? '')
            .replace('<', '&lt;')
            .replace('>', '&gt;');
        let rendered = markdownToHTML(original);

        if (original !== rendered) {
            const temporaryRoot = parser.parseFromString(
                `<div class="temporary-root">${rendered}</div>`,
                'text/html'
            ).documentElement;

            replaceMediaSources(temporaryRoot, mediaMap);
            rendered = temporaryRoot.innerHTML;
            key = `$$$${index}`;
            replacements[key] = rendered;
            el.textContent = key;
        }
    });

    let htmlStr = docToString(htmlDoc, 'text/html');

    // Now replace the placeholders with the rendered HTML
    // in reverse order so outputs are done last
    Object.keys(replacements)
        .reverse()
        .forEach((key) => {
            const replacement = replacements[key];
            if (replacement) {
                /**
                 * The replacement is called as a function here so special string
                 * replacement sequences are preserved if they appear within Markdown.
                 *  @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement}
                 */
                htmlStr = htmlStr.replace(key, () => replacement);
            }
        });

    return htmlStr;
};

const docToString = (doc: XMLDocument, mimeType = 'text/xml') => {
    const { documentElement } = doc;
    const { innerHTML } = documentElement;

    if (mimeType === 'text/html') {
        const { documentElement } = parser.parseFromString(
            innerHTML,
            'text/html'
        );

        return documentElement.outerHTML;
    }

    return innerHTML.replace(
        /^(<model[^>]*\s)xmlns="http:\/\/www.w3.org\/2002\/xforms"([^>]*>)/,
        '$1$2'
    );
};

const md5 = (message: string | Buffer) => {
    const hash = crypto.createHash('md5');
    hash.update(message);

    return hash.digest('hex');
};

/** @package */
export const PACKAGE_VERSION = pkg.version;

const VERSION = md5(xslForm + xslModel + PACKAGE_VERSION);

export { VERSION as version };

export const sheets = {
    xslForm,
    xslModel,
};

export { escapeURLPath, NAMESPACES };

/**
 * Exported for backwards compatibility, prefer named imports from enketo-transformer's index module.
 */
export default {
    transform,
    version: VERSION,
    NAMESPACES,
    sheets,
    escapeURLPath,
};
