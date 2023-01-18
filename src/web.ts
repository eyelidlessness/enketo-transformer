import { transform } from './transformer';

/* eslint-disable @typescript-eslint/no-explicit-any */
const setGlobal = (key: string, value: any) => {
    (globalThis as any)[key] = value;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

setGlobal('enketo', {
    transformer: {
        transform,
    },
});

if (ENV === 'web') {
    import('./demo');
}
