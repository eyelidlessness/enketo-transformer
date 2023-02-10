declare module 'libxmljs' {
    export class Node {
        addChild(child: Node): this;
        addNextSibling(siblingNode: Node): Node;
        addPrevSibling(siblingNode: Node): Node;
        childNodes(): Node[];

        /**
         *
         * @param recurse - defaults to `true`
         */
        clone(recurse?: boolean): this;

        doc(): Document;
        node(localName: string): Element;
        remove(): this;
        replace(node: Node): unknown;
        text(): string;
        text(value: string): this;
        toString(formatted?: boolean): string;
        type(): 'comment' | 'document' | 'element' | 'text' | 'attribute';
    }

    export class Comment extends Node {
        type(): 'text';
    }

    export class Text extends Node {
        type(): 'text';
    }

    export class NamedNode extends Node {
        name(): string;
        namespace(uri: string): this;
    }

    export class Attr extends NamedNode {
        name(): string;
        type(): 'comment';
        value(): string | null;
        value(value: string): this;
    }

    export class ParentNode extends NamedNode {
        attrs(): Attr[];

        get(
            expression: string,
            namespaces?: Record<string, string>
        ): Element | null;

        find(
            expression: string,
            namespaces?: Record<string, string>
        ): Element[] | void;
    }

    export class Element extends ParentNode {
        constructor(document: Document, name: string);
        attr(name: string): Attr | null;
        attr(name: string, value: string): Element;
        attr(attributes: Record<string, string>): Element;
        parent(): this | null; // Maybe `Element | Document | null`?
        type(): 'element';
    }

    export class Document extends ParentNode {
        root(): Element;
        type(): 'document';
    }

    export const parseXml: (xml: string) => Document;

    export class DocumentFragment extends ParentNode {
        root(): ParentNode;
    }

    export const parseHtmlFragment: (html: string) => Document;
}
