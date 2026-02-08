import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function runOrFail(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runOrFail('npx', ['pnpm', '--filter', '@listenlater/web', 'run', 'prisma:generate']);
runOrFail('npx', ['pnpm', '--filter', '@listenlater/worker', 'run', 'prisma:generate']);
runOrFail('npx', ['pnpm', '--filter', '@listenlater/web', 'run', 'db:bootstrap']);
runOrFail('npx', ['pnpm', '--filter', '@listenlater/web', 'run', 'seed:demo']);

const commandNames = ['web', 'worker'];
const commandList = [
  'npm run dev --workspace @listenlater/web',
  'npm run dev --workspace @listenlater/worker'
];

const pythonTtsEnabled = process.env.ENABLE_PYTHON_TTS_DEV !== '0';
const uvicornPath = resolve(process.cwd(), 'services/python-tts/.venv/bin/uvicorn');
if (pythonTtsEnabled && existsSync(uvicornPath)) {
  const ttsPort = process.env.PYTHON_TTS_PORT ?? '8010';
  commandNames.push('py-tts');
  commandList.push(`cd services/python-tts && ./.venv/bin/uvicorn app.main:app --reload --port ${ttsPort}`);
} else if (pythonTtsEnabled) {
  // eslint-disable-next-line no-console
  console.log('[dev] python-tts virtualenv not found at services/python-tts/.venv, skipping py-tts process');
}

const child = spawn('npx', [
  'concurrently',
  '--names',
  commandNames.join(','),
  '--prefix-colors',
  'green,blue,magenta',
  ...commandList
], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
