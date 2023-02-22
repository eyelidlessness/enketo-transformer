/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { DOM } from '../abstract';

/** @package */
export const XPathResult =
    globalThis.XPathResult satisfies new () => DOM.XPathResult;
