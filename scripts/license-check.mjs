import fs from 'node:fs';
import path from 'node:path';

const deny = ['AGPL', 'SSPL', 'Non-Commercial', 'GPL-3.0'];
const lockFile = path.resolve('pnpm-lock.yaml');

if (!fs.existsSync(lockFile)) {
  console.log('pnpm-lock.yaml not found. Skipping strict license scan for now.');
  process.exit(0);
}

const text = fs.readFileSync(lockFile, 'utf8');
const found = deny.filter((term) => text.toLowerCase().includes(term.toLowerCase()));

if (found.length > 0) {
  console.error(`Disallowed license markers found in lockfile text: ${found.join(', ')}`);
  process.exit(1);
}

console.log('No disallowed license markers found in lockfile text.');
