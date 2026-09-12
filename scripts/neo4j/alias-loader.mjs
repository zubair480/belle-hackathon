/**
 * Node ESM loader hook so plain `node --import` scripts can resolve the project's "@/..." alias
 * (tsconfig paths) to ./src/*.ts without a bundler. Usage:
 *   node --import ./scripts/neo4j/alias-loader.mjs scripts/neo4j/seed-ev.mts
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  `data:text/javascript,${encodeURIComponent(`
    import { existsSync } from "node:fs";
    import { fileURLToPath, pathToFileURL } from "node:url";
    import { join } from "node:path";
    let srcDir = null;
    export function initialize(data) { srcDir = data.srcDir; }
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith("@/")) {
        const base = join(srcDir, specifier.slice(2));
        for (const cand of [base + ".ts", base + ".tsx", base + ".mts", join(base, "index.ts")]) {
          if (existsSync(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
        }
      }
      return next(specifier, context);
    }
  `)}`,
  { parentURL: import.meta.url, data: { srcDir: new URL("../../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") } },
);
void pathToFileURL;
