/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

export const preprocess = (): never => {
    throw new Error('Preprocess is not supported by @enketo/transformer-web');
};

export const {
    Attr,
    Comment,
    Document,
    DocumentFragment,
    DOMParser,
    Node,
    Element,
    Text,
    XMLDocument,
    XMLDocument: XSLTDocument,
    XMLSerializer,
    XSLTProcessor,
} = globalThis;

export { NAMESPACES } from './shared';
