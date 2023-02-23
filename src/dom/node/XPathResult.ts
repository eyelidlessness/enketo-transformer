import { Attr } from 'libxmljs';
import type { DOM } from '../abstract';
import { NodeTypes } from '../shared';
import { DOMExtendedAttr } from './Attr';

/** @package */
export class XPathResult implements DOM.XPathResult {
    static ORDERED_NODE_SNAPSHOT_TYPE = 6 as const;

    static FIRST_ORDERED_NODE_TYPE = 9 as const;

    private results: DOM.Node[];

    get singleNodeValue() {
        return this.results[0] ?? null;
    }

    get snapshotLength() {
        return this.results.length;
    }

    constructor(expression: string, results: DOM.Node[]) {
        const hasAttrExpression = /\/@[^,/ ']+$/.test(expression);

        this.results = hasAttrExpression
            ? results.map((result) =>
                  result.nodeType === NodeTypes.ATTRIBUTE_NODE
                      ? new DOMExtendedAttr(result as Attr)
                      : result
              )
            : results;
    }

    snapshotItem(index: number) {
        return this.results[index];
    }
}

type XPathResultTypeKeys = {
    [K in keyof XPathResult]: K extends `${string}_TYPE` ? K : never;
}[keyof XPathResult];

/** @package */
export type XPathResultType = XPathResult[XPathResultTypeKeys];
