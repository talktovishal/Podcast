import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
interface WebpackInput {
  resolve: { alias: Record<string, string> };
}
const nextConfig: {
  webpack<T extends WebpackInput>(config: T, options: { isServer: boolean }): T;
} = require("../next.config.mjs").default;
const fromCore = createRequire(require.resolve("@articlepod/core"));
const fromJsdom = createRequire(fromCore.resolve("jsdom"));
const dependencyDirectory = dirname(dirname(fromJsdom.resolve("css-tree/package.json")));
const compiler = require("next/dist/compiled/webpack/webpack");
compiler.init();

interface Stats {
  hasErrors(): boolean;
  toString(): string;
}

const probe = `
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const root = pathToFileURL(process.argv[1] + "/").href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (!result.url.startsWith("node:") && !result.url.startsWith(root)) {
      throw new Error("RUNTIME_BUNDLE_ESCAPED");
    }
    return result;
  }
});
const value = createRequire(import.meta.url)(process.argv[1] + "/bundle.cjs");
process.stdout.write(JSON.stringify(value));
`;

test("server CSS aliases preserve existing aliases and leave client resolution unchanged", () => {
  const client = { resolve: { alias: { existing: "unchanged" } } };
  assert.equal(nextConfig.webpack(client, { isServer: false }), client);
  assert.deepEqual(client.resolve.alias, { existing: "unchanged" });
  const aliases: Record<string, string> = { existing: "unchanged" };
  const server = { resolve: { alias: aliases } };
  assert.equal(nextConfig.webpack(server, { isServer: true }), server);
  assert.equal(server.resolve.alias.existing, "unchanged");
  assert.equal(server.resolve.alias["css-tree$"], fromJsdom.resolve("css-tree"));
  assert.equal(server.resolve.alias["css-tree/definition-syntax-data-patch$"],
    fromJsdom.resolve("css-tree/definition-syntax-data-patch"));
});

test("CSS parsing and JSON grammar data work without the original dependency directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "articlepod-css-bundle-"));
  try {
    const entry = join(directory, "entry.mjs");
    await writeFile(entry, `
import { parse, lexer } from "css-tree";
import patch from "css-tree/definition-syntax-data-patch";
export const astType = parse("body { color: red }").type;
export const colorMatches = Boolean(lexer.matchProperty("color", "red").matched);
export const hasPatch = Object.keys(patch).length > 0;
`);
    for (const fixed of [false, true]) {
      const output = join(directory, fixed ? "fixed" : "baseline");
      await mkdir(output);
      const config = {
        mode: "production",
        target: "node",
        // Next supplies its own minifier; this fixture only needs module bundling.
        optimization: { minimize: false },
        entry,
        output: { path: output, filename: "bundle.cjs", library: { type: "commonjs2" } },
        resolve: { modules: ["node_modules", dependencyDirectory], alias: {} },
        module: { parser: { javascript: { createRequire: false } } }
      };
      if (fixed) {
        nextConfig.webpack(config, { isServer: true });
      }
      const stats = await new Promise<Stats>((resolve, reject) => {
        compiler.webpack(config, (error: Error | null, result?: Stats) => {
          if (error) reject(error);
          else if (!result) reject(new Error("WEBPACK_STATS_MISSING"));
          else resolve(result);
        });
      });
      assert.equal(stats.hasErrors(), false, stats.toString());
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe, output], {
        env: { NODE_ENV: "production" },
        encoding: "utf8",
        timeout: 30_000
      });
      assert.ifError(result.error);
      if (fixed) {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
          astType: "StyleSheet", colorMatches: true, hasPatch: true
        });
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /RUNTIME_BUNDLE_ESCAPED/);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
