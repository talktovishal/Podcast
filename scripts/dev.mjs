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

runOrFail('npx', ['pnpm', '--filter', '@articlepod/web', 'run', 'prisma:generate']);
runOrFail('npx', ['pnpm', '--filter', '@articlepod/worker', 'run', 'prisma:generate']);
runOrFail('npx', ['pnpm', '--filter', '@articlepod/web', 'run', 'db:bootstrap']);
runOrFail('npx', ['pnpm', '--filter', '@articlepod/web', 'run', 'seed:demo']);

const commandNames = ['web', 'worker'];
const commandList = [
  'npm run dev --workspace @articlepod/web',
  'npm run dev --workspace @articlepod/worker'
];
const prefixColors = ['green', 'blue'];

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
