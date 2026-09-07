/// <reference types="vite/client" />

/** Side-effect CSS imports. Vite handles the bundling; TypeScript only needs to
 *  know the module exists. */
declare module '*.css';
