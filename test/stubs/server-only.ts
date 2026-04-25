// No-op stub for Next.js's `server-only` package, aliased in vitest.config.ts.
// The real module throws on import to prevent server-only utilities from
// being bundled into client code. That signal is meaningless under vitest
// (no client bundle), so we replace it with an empty module.
export {};
