import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, '..', 'next.config.mjs');
const configSource = readFileSync(configPath, 'utf8');

test('CSS Tree server bundle portability', () => {
  const parsed = spawnSync(process.execPath, ['--check', configPath], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
  assert.match(configSource, /if\s*\(isServer\)/);
  assert.match(configSource, /['"]css-tree\$['"]/);
  assert.match(configSource, /['"]css-tree\/data\/patch\.json\$['"]/);
});

test('relocated CSS Tree data has a scoped negative control', () => {
  assert.doesNotMatch(configSource, /['"]\.\.\/data\/patch\.json['"]\s*:/);
  assert.match(configSource, /path\.resolve\(path\.dirname\(cssTreeCjs\)/);
});

test('existing client aliases remain merged', () => {
  assert.match(configSource, /\.\.\.config\.resolve\.alias/);
});
