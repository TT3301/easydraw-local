// The canvas engine reads browser globals at import time. Geometry, binding
// and text layout need none of them once text metrics are injected, so tests
// import this module first to run those engine paths under Node.
const g = globalThis as Record<string, unknown>;
g.window ??= globalThis;
g.location ??= { origin: "http://localhost", href: "http://localhost/" };
g.devicePixelRatio ??= 1;
g.document ??= { createElement: () => ({ style: {}, setAttribute: () => {}, getContext: () => ({}) }), addEventListener: () => {} };
export {};
