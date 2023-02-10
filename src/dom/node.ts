/* eslint-disable max-classes-per-file */
import libxslt, { libxmljs } from 'libxslt';
import type { XSLTStylesheet } from 'libxslt';
import * as XMLJS from 'libxmljs';
import { DOMMimeType, NAMESPACES, NodeType, NODE_TYPES } from './shared';

type LibXMLJS = typeof libxmljs;

export const preprocess = (
    doc: XMLJS.Document,
    fn: (this: LibXMLJS, doc: XMLJS.Document) => XMLJS.Document
) => fn.call(libxmljs, doc);

const xmljsNodeToOwnerDocument = new Map<XMLJS.Node, Document>();

const getOwnerDocument = (xmljsNode: XMLJS.Node) => {
    let ownerDocument = xmljsNodeToOwnerDocument.get(xmljsNode);

    if (ownerDocument == null) {
        const xmljsDoc =
            xmljsNode instanceof libxmljs.Document
                ? xmljsNode
                : xmljsNode.doc();

        ownerDocument = new Document(xmljsDoc);
        xmljsNodeToOwnerDocument.set(xmljsNode, ownerDocument);
    }

    return ownerDocument;
};

const xmljsNodeToDOMNode = new Map<XMLJS.Node, Node>();

type DOMCompatibilityType<T extends XMLJS.Node> = T extends XMLJS.Document
    ? Document
    : T extends XMLJS.DocumentFragment
    ? DocumentFragment
    : T extends XMLJS.Element
    ? Element
    : T extends XMLJS.Attr
    ? Attr
    : T extends XMLJS.Text
    ? Text
    : T extends XMLJS.Comment
    ? Comment
    : Node;

const getDOMNode = <T extends XMLJS.Node>(node: T) =>
    xmljsNodeToDOMNode.get(node) as DOMCompatibilityType<T> | null;

const domNodeToXMLJSNode = new Map<Node, XMLJS.Node>();

export const cleanCaches = () => {
    [xmljsNodeToOwnerDocument, xmljsNodeToDOMNode, domNodeToXMLJSNode].forEach(
        (map) => {
            for (const key of map.keys()) {
                map.delete(key as any);
            }
        }
    );
};

type LibXMLJSType<T extends Node> = T extends Document
    ? XMLJS.Document
    : T extends DocumentFragment
    ? XMLJS.DocumentFragment
    : T extends Element
    ? XMLJS.Element
    : T extends Attr
    ? XMLJS.Attr
    : T extends Text
    ? XMLJS.Text
    : T extends Comment
    ? XMLJS.Comment
    : XMLJS.Node;

const getXMLJSNode = <T extends Node>(node: T) =>
    domNodeToXMLJSNode.get(node) as LibXMLJSType<T>;

const isXMLJSElement = (node: XMLJS.Node): node is XMLJS.Element =>
    node.type() === 'element';

const isXMLJSAttr = (node: XMLJS.Node): node is XMLJS.Attr =>
    node.type() === 'attribute';

const isXMLJSText = (node: XMLJS.Node): node is XMLJS.Text =>
    node.type() === 'text';

const isXMLJSComment = (node: XMLJS.Node): node is XMLJS.Comment =>
    node.type() === 'comment';

const toDOMCompatibilityNode = <T extends XMLJS.Node>(
    xmljsNode: T
): DOMCompatibilityType<T> => {
    const node = getDOMNode(xmljsNode);

    if (node != null) {
        return node;
    }

    if (isXMLJSElement(xmljsNode)) {
        return new Element(xmljsNode) as DOMCompatibilityType<T>;
    }

    if (isXMLJSAttr(xmljsNode)) {
        return new Attr(xmljsNode) as DOMCompatibilityType<T>;
    }

    if (isXMLJSText(xmljsNode)) {
        return new Text(xmljsNode) as DOMCompatibilityType<T>;
    }

    if (isXMLJSComment(xmljsNode)) {
        return new Comment(xmljsNode) as DOMCompatibilityType<T>;
    }

    throw new Error('');
};

/**
 * TODO:
 *
 * - Owner document can be derived! That should *vastly* simplify API.
 * - Use `dirty` flags on writes so we can cache?
 */

export class Node {
    static readonly ELEMENT_NODE = NODE_TYPES.ELEMENT_NODE;

    static readonly ATTRIBUTE_NODE = NODE_TYPES.ATTRIBUTE_NODE;

    static readonly TEXT_NODE = NODE_TYPES.TEXT_NODE;

    static readonly CDATA_SECTION_NODE = NODE_TYPES.CDATA_SECTION_NODE;

    static readonly PROCESSING_INSTRUCTION_NODE =
        NODE_TYPES.PROCESSING_INSTRUCTION_NODE;

    static readonly COMMENT_NODE = NODE_TYPES.COMMENT_NODE;

    static readonly DOCUMENT_NODE = NODE_TYPES.DOCUMENT_NODE;

    static readonly DOCUMENT_TYPE_NODE = NODE_TYPES.DOCUMENT_TYPE_NODE;

    static readonly DOCUMENT_FRAGMENT_NODE = NODE_TYPES.DOCUMENT_FRAGMENT_NODE;

    readonly nodeType: NodeType = NODE_TYPES.ELEMENT_NODE;

    readonly ownerDocument: Document | null;

    get childNodes(): Node[] {
        return this.xmljsNode.childNodes().map(toDOMCompatibilityNode);
    }

    constructor(protected xmljsNode: XMLJS.Node) {
        this.ownerDocument =
            this instanceof Document ? this : getOwnerDocument(xmljsNode);
        this.xmljsNode = xmljsNode;
        xmljsNodeToDOMNode.set(xmljsNode, this);
        domNodeToXMLJSNode.set(this, xmljsNode);
    }

    cloneNode<T extends Node>(this: T, deep?: boolean) {
        const xmljsNode = this.xmljsNode.clone(deep);

        return new (this.constructor as new (...args: any[]) => T)(xmljsNode);
    }

    removeChild = (childNode: Node) => {
        childNode.xmljsNode.remove();
    };

    get innerHTML() {
        return this.outerHTML
            .trim()
            .replace(/<[^>]+>((.|\n)*)<\/[^>]+>(?!.)/, '$1');
    }

    get outerHTML() {
        /**
         * The following TODO was moved from `transformer.ts` while wrapping `libxmljs` in this DOM compatibility interface. The answer appears to be no! Preserved for visibility, we will likely remove it before merge.
         *
         * TODO: does this result in self-closing tags?
         */
        return this.xmljsNode.toString(false);
    }

    get textContent() {
        return this.xmljsNode.text();
    }

    set textContent(textContent: string) {
        this.xmljsNode.text(textContent);
    }
}

abstract class NamedNode extends Node {
    abstract readonly nodeType: NodeType;

    readonly nodeName = this.xmljsNode.name?.();

    constructor(protected xmljsNode: XMLJS.NamedNode) {
        super(xmljsNode);
    }
}

export class Attr extends NamedNode {
    override readonly nodeType = NODE_TYPES.ATTRIBUTE_NODE;

    constructor(protected xmljsNode: XMLJS.Attr) {
        super(xmljsNode);
    }
}

export class Comment extends Node {
    readonly nodeType = NODE_TYPES.COMMENT_NODE;
}

export class Text extends Node {
    readonly nodeType = NODE_TYPES.TEXT_NODE;
}

const isDOMElement = (node: Node): node is Element =>
    node.nodeType === Node.ELEMENT_NODE;

abstract class ParentNode extends NamedNode {
    get children() {
        return this.childNodes.filter(isDOMElement);
    }

    get firstElementChild() {
        return this.childNodes.find(isDOMElement);
    }

    constructor(protected xmljsNode: XMLJS.ParentNode) {
        super(xmljsNode);
    }
}

export type { ParentNode };

class DOMTokenList {
    private tokens: Set<string>;

    constructor(
        private xmljsElement: XMLJS.Element,
        private tokenAttr: string
    ) {
        this.tokens = new Set(
            xmljsElement.attr(tokenAttr)?.value()?.trim()?.split(/\s+/) ?? []
        );
    }

    private updateElement() {
        this.xmljsElement.attr(this.tokenAttr, [...this.tokens].join(' '));
    }

    add(className: string) {
        const result = this.tokens.add(className);

        this.updateElement();

        return result;
    }

    contains(className: string) {
        return this.tokens.has(className);
    }

    replace(oldToken: string, newToken: string) {
        this.tokens = new Set(
            [...this.tokens].map((item) =>
                item === oldToken ? newToken : item
            )
        );
        this.updateElement();
    }

    values() {
        return this.tokens.values();
    }
}

export class Element extends ParentNode {
    readonly nodeType = NODE_TYPES.ELEMENT_NODE;

    get className() {
        return this.getAttribute('class') ?? '';
    }

    get parentElement() {
        const xmljsParent = this.xmljsNode.parent();

        if (xmljsParent == null) {
            return null;
        }

        return toDOMCompatibilityNode(xmljsParent);
    }

    readonly classList: DOMTokenList;

    constructor(protected xmljsNode: XMLJS.Element) {
        super(xmljsNode);

        this.classList = new DOMTokenList(xmljsNode, 'class');
    }

    appendChild(child: Node): void {
        this.xmljsNode.addChild(getXMLJSNode(child));
    }

    getAttribute(name: string) {
        return this.xmljsNode.attr(name)?.value() ?? null;
    }

    insertBefore = (node: Node, referenceNode: Node) => {
        getXMLJSNode(referenceNode).addPrevSibling(getXMLJSNode(node));
    };

    setAttribute(name: string, value: string) {
        this.xmljsNode.attr(name, value);
    }

    replaceChildren(...nodes: Node[]) {
        this.childNodes.forEach((childNode) => {
            this.removeChild(childNode);
        });

        nodes.forEach((node) => {
            this.appendChild(node);
        });
    }

    remove() {
        this.xmljsNode.remove();
    }

    replaceWith(...nodes: Node[]) {
        nodes.forEach((node) => {
            this.insertBefore(node, this);
        });
        this.xmljsNode.remove();
    }
}

const documentImplementation = {
    createDocument: (namepaceURI: string, rootNodeName: string) => {
        const parser = new DOMParser();

        const xml = /* xml */ `<${rootNodeName} xmlns="${namepaceURI}" />`;

        return parser.parseFromString(xml, 'text/xml');
    },
};

export class Document extends ParentNode {
    readonly nodeType = NODE_TYPES.DOCUMENT_NODE;

    readonly documentElement: Element;

    readonly implementation = documentImplementation;

    constructor(protected xmljsNode: XMLJS.Document) {
        super(xmljsNode);

        const root = xmljsNode.root();

        xmljsNodeToOwnerDocument.set(xmljsNode, this);
        xmljsNodeToOwnerDocument.set(root, this);
        this.documentElement = new Element(root);
    }

    createDocumentFragment = () => new DocumentFragment(this.ownerDocument);

    createElement(name: string) {
        const xmljsElement = this.xmljsNode.root().node(name).remove();

        return new Element(xmljsElement);
    }

    createElementNS(_namespaceURI: string, name: string) {
        return this.createElement(name);
    }
}

export const getNodesByXPathExpression = (
    doc: Document,
    expression: string,
    context: Document | Element | DocumentFragment = doc
) => {
    const xmljsElement = getXMLJSNode(context);

    return (
        xmljsElement
            .find(expression, NAMESPACES)
            ?.map((item) => toDOMCompatibilityNode(item)) ?? []
    );
};

export class XMLDocument extends Document {}

export class XSLTDocument extends XMLDocument {
    constructor(
        xmljsNode: XMLJS.Document,
        readonly stylesheet: libxslt.XSLTStylesheet
    ) {
        super(xmljsNode);
    }
}

export class DocumentFragment extends ParentNode {
    readonly nodeType = NODE_TYPES.DOCUMENT_FRAGMENT_NODE;

    constructor(readonly ownerDocument: Document | null) {
        const doc = libxmljs.parseXml('<root/>');
        const root = doc.root();

        super(root);
    }

    append(...nodes: Node[]) {
        nodes.forEach((node) => {
            this.xmljsNode.addChild(getXMLJSNode(node));
        });
    }
}

export class XSLTProcessor {
    private stylesheet: XSLTStylesheet | null = null;

    private parameters: Record<string, any> = {};

    importStylesheet(stylesheetDoc: XMLDocument) {
        this.stylesheet = libxslt.parse(
            stylesheetDoc.documentElement.outerHTML
        );
    }

    setParameter(_namespaceURI: string | null, key: string, value: any) {
        this.parameters[key] = value;
    }

    transformToFragment(
        source: XMLDocument,
        output: Document
    ): DocumentFragment {
        const { stylesheet } = this;
        const transformed = stylesheet?.apply(
            getXMLJSNode(source),
            this.parameters
        );

        if (transformed == null) {
            throw new Error('Transform failed');
        }

        const fragment = output.createDocumentFragment();
        const childNodes = transformed
            .childNodes()
            .map((child) => toDOMCompatibilityNode(child));

        childNodes.forEach((child) => {
            fragment.append(child);
        });

        return fragment;
    }
}

export type PreprocessXForm = (
    this: LibXMLJS,
    doc: XMLJS.Document
) => XMLJS.Document;

export const preprocessXForm = (
    preprocess: PreprocessXForm,
    doc: XMLDocument
) => new XMLDocument(preprocess.call(libxmljs, getXMLJSNode(doc)));

export class DOMParser {
    parseFromString = (str: string, mimeType: DOMMimeType) => {
        if (mimeType === 'text/html') {
            const xmljsDoc = libxmljs.parseHtmlFragment(str);

            return new Document(xmljsDoc);
        }

        const xmljsDoc = libxmljs.parseXml(str);

        return new XMLDocument(xmljsDoc);
    };
}

export class XMLSerializer {
    serializeToString = (node: Node) => node.outerHTML;
}

export { NAMESPACES };
