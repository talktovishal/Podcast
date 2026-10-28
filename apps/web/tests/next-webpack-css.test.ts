import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
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
const value = await createRequire(import.meta.url)(process.argv[1] + "/bundle.cjs");
process.stdout.write(JSON.stringify(value));
`;

test("server CSS aliases preserve existing aliases and leave client resolution unchanged", () => {
  const client = { resolve: { alias: { existing: "unchanged" } } };
  assert.equal(nextConfig.webpack(client, { isServer: false }), client);
  assert.deepEqual(client.resolve.alias, { existing: "unchanged" });
  const aliases: Record<string, string> = { existing: "unchanged" };
  const server = { resolve: { alias: aliases }, externals: ["existing-external"] };
  assert.equal(nextConfig.webpack(server, { isServer: true }), server);
  assert.equal(server.resolve.alias.existing, "unchanged");
  assert.equal(server.resolve.alias["css-tree$"], fromJsdom.resolve("css-tree"));
  assert.equal(server.resolve.alias["css-tree/definition-syntax-data-patch$"],
    fromJsdom.resolve("css-tree/definition-syntax-data-patch"));
  assert.equal(server.externals.length, 2);
  assert.equal(server.externals[1], "existing-external");
});

test("PDF imports use runtime dependencies and extract text after bundle relocation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "articlepod-pdf-bundle-"));
  try {
    const entry = join(directory, "entry.mjs");
    const output = join(directory, "build");
    await mkdir(output);
    await writeFile(entry, 'export { getDocument, version } from "pdfjs-dist/legacy/build/pdf.mjs";');
    const config = {
      mode: "production",
      target: "node",
      optimization: { minimize: false },
      entry,
      output: { path: output, filename: "bundle.cjs", library: { type: "commonjs2" } },
      resolve: {
        modules: ["node_modules", dirname(dirname(fromCore.resolve("pdfjs-dist/package.json")))],
        alias: {}
      }
    };
    nextConfig.webpack(config, { isServer: true });
    const stats = await new Promise<Stats>((resolve, reject) => {
      compiler.webpack(config, (error: Error | null, result?: Stats) => {
        if (error) reject(error);
        else if (!result) reject(new Error("WEBPACK_STATS_MISSING"));
        else resolve(result);
      });
    });
    assert.equal(stats.hasErrors(), false, stats.toString());

    const runtime = join(directory, "runtime");
    await rename(output, runtime);
    const core = join(runtime, "node_modules/@articlepod/core");
    const pdf = join(core, "node_modules/pdfjs-dist/legacy/build");
    await mkdir(pdf, { recursive: true });
    await writeFile(join(core, "package.json"), '{"main":"index.cjs"}');
    await writeFile(join(core, "index.cjs"), "");
    await writeFile(join(pdf, "pdf.mjs"),
      'export const version = "runtime-pdf"; export function getDocument() {}');
    const relocated = spawnSync(process.execPath, ["--input-type=module", "-e", probe, runtime], {
      env: { NODE_ENV: "production" }, encoding: "utf8", timeout: 30_000
    });
    assert.ifError(relocated.error);
    assert.equal(relocated.status, 0, relocated.stderr);
    assert.deepEqual(JSON.parse(relocated.stdout), { version: "runtime-pdf" });

    const realRuntime = join(directory, "real-runtime");
    await mkdir(join(realRuntime, "node_modules/@articlepod"), { recursive: true });
    await copyFile(join(runtime, "bundle.cjs"), join(realRuntime, "bundle.cjs"));
    await symlink(dirname(require.resolve("@articlepod/core/package.json")),
      join(realRuntime, "node_modules/@articlepod/core"), "junction");
    const pdfProbe = `
import { createRequire } from "node:module";
const { getDocument } = await createRequire(import.meta.url)(process.argv[1] + "/bundle.cjs");
const stream = "BT /F1 12 Tf 10 100 Td (Portable PDF text) Tj ET";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  "<< /Length " + stream.length + " >>\\nstream\\n" + stream + "\\nendstream",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
];
let pdf = "%PDF-1.4\\n";
const offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(pdf.length);
  pdf += (index + 1) + " 0 obj\\n" + object + "\\nendobj\\n";
}
const xref = pdf.length;
pdf += "xref\\n0 6\\n0000000000 65535 f \\n";
for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \\n";
pdf += "trailer\\n<< /Size 6 /Root 1 0 R >>\\nstartxref\\n" + xref + "\\n%%EOF\\n";
const document = await getDocument({
  data: new Uint8Array(Buffer.from(pdf)), useSystemFonts: true, verbosity: 0
}).promise;
const page = await document.getPage(1);
const content = await page.getTextContent();
process.stdout.write(JSON.stringify({
  pages: document.numPages, text: content.items.map(item => item.str || "").join("")
}));
await document.destroy();
`;
    const extracted = spawnSync(process.execPath, ["--input-type=module", "-e", pdfProbe, realRuntime], {
      env: { NODE_ENV: "production" }, encoding: "utf8", timeout: 30_000
    });
    assert.ifError(extracted.error);
    assert.equal(extracted.status, 0, extracted.stderr);
    assert.deepEqual(JSON.parse(extracted.stdout), { pages: 1, text: "Portable PDF text" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
