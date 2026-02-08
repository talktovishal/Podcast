import { spawnSync, spawn } from 'node:child_process';

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
runOrFail('npx', ['pnpm', '--filter', '@listenlater/web', 'run', 'db:bootstrap']);
runOrFail('npx', ['pnpm', '--filter', '@listenlater/web', 'run', 'seed:demo']);

const child = spawn('npx', [
  'concurrently',
  '--names',
  'web,worker',
  '--prefix-colors',
  'green,blue',
  'npm run dev --workspace @listenlater/web',
  'npm run dev --workspace @listenlater/worker'
], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
