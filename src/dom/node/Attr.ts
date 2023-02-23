import type { Attr } from 'libxmljs';
import type { DOM } from '../abstract';
import { NodeTypes } from '../shared';

export class DOMExtendedAttr implements DOM.Node, DOM.Attr {
    readonly nodeType = NodeTypes.ATTRIBUTE_NODE;

    get name() {
        return this.attr.name();
    }

    get namespaceURI() {
        return this.attr.namespace().href();
    }

    get ownerDocument() {
        return this.attr.doc();
    }

    readonly parentElement = null;

    get textContent() {
        return this.attr.value();
    }

    get value() {
        return this.attr.value();
    }

    constructor(readonly attr: Attr) {}

    cloneNode() {
        return this.attr.clone();
    }
}
