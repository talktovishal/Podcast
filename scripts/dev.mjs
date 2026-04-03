import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load root .env into process.env so child processes (including Next.js)
// inherit vars like GOOGLE_CLIENT_ID that may not be in apps/web/.env.
// Next.js won't override vars already present in process.env.
const rootEnvPath = resolve(process.cwd(), '.env');
if (existsSync(rootEnvPath)) {
  const lines = readFileSync(rootEnvPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const runtimeProfile = process.env.RUNTIME_PROFILE ?? 'simple';
const webOnly = process.argv.includes('--web-only');
const databaseUrl = process.env.DATABASE_URL;
if (runtimeProfile === 'simple' && databaseUrl?.startsWith('file:')) {
  const rawPath = databaseUrl.replace(/^file:/, '');
  if (rawPath && !rawPath.startsWith('/') && rawPath !== ':memory:') {
    process.env.DATABASE_URL = `file:${resolve(process.cwd(), rawPath)}`;
  }
}

function runOrFail(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runOrFail('npx', ['pnpm', '--filter', '@articlepod/web', 'run', 'prisma:generate']);
runOrFail('npx', ['pnpm', '--filter', '@articlepod/web', 'run', 'db:bootstrap']);
runOrFail('npx', ['pnpm', '--filter', '@articlepod/web', 'run', 'seed:demo']);

const commandNames = ['web'];
const commandList = ['npm run dev --workspace @articlepod/web'];
const prefixColors = ['green'];

if (!webOnly) {
  runOrFail('npx', ['pnpm', '--filter', '@articlepod/worker', 'run', 'prisma:generate']);
  commandNames.push('worker');
  prefixColors.push('blue');
  commandList.push('npm run dev --workspace @articlepod/worker');

  const pythonTtsEnabled = process.env.ENABLE_PYTHON_TTS_DEV !== '0';
  const uvicornPath = resolve(process.cwd(), 'services/python-tts/.venv/bin/uvicorn');
  if (pythonTtsEnabled && existsSync(uvicornPath)) {
    const ttsPort = process.env.PYTHON_TTS_PORT ?? '8010';
    commandNames.push('py-tts');
    prefixColors.push('magenta');
    commandList.push(`cd services/python-tts && ./.venv/bin/uvicorn app.main:app --reload --port ${ttsPort}`);
    commandNames.push('prewarm');
    prefixColors.push('yellow');
    commandList.push('bash ./scripts/prewarm-kokoro-previews.sh');
  } else if (pythonTtsEnabled) {
    // eslint-disable-next-line no-console
    console.log('[dev] python-tts virtualenv not found at services/python-tts/.venv, skipping py-tts process');
  }
}

const child = spawn('npx', [
  'concurrently',
  '--names',
  commandNames.join(','),
  '--prefix-colors',
  prefixColors.join(','),
  ...commandList
], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
