/**
 * Node ESM loader hook so plain `node --import` scripts can resolve the project's "@/..." alias
 * (tsconfig paths) and extensionless relative imports inside ./src/*.ts without a bundler. Usage:
 *   node --import ./scripts/neo4j/alias-loader.mjs scripts/neo4j/seed-ev.mts
 */
import { register } from "node:module";

const srcDir = new URL("../../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

register(
  `data:text/javascript,${encodeURIComponent(`
    import { existsSync, statSync } from "node:fs";
    import { fileURLToPath, pathToFileURL } from "node:url";
    import { join, dirname } from "node:path";
    let srcDir = null;
    export function initialize(data) { srcDir = data.srcDir; }
    function tryFile(base) {
      for (const cand of [base, base + ".ts", base + ".tsx", base + ".mts", join(base, "index.ts")]) {
        if (existsSync(cand) && statSync(cand).isFile()) return pathToFileURL(cand).href;
      }
      return null;
    }
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith("@/")) {
        const hit = tryFile(join(srcDir, specifier.slice(2)));
        if (hit) return { url: hit, shortCircuit: true };
      }
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && context.parentURL.startsWith("file:")) {
        const parentPath = fileURLToPath(context.parentURL);
        if (parentPath.endsWith(".ts") || parentPath.endsWith(".tsx") || parentPath.endsWith(".mts")) {
          const hit = tryFile(join(dirname(parentPath), specifier));
          if (hit) return { url: hit, shortCircuit: true };
        }
      }
      return next(specifier, context);
    }
  `)}`,
  { parentURL: import.meta.url, data: { srcDir } },
);
