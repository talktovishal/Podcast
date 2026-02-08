import fs from 'node:fs';

const required = ['DATABASE_URL', 'APP_URL'];
const optional = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_CLIENT_SECRET',
  'OPENAI_API_KEY'
];

const missingRequired = required.filter((key) => !process.env[key]);

if (missingRequired.length > 0) {
  console.log('Missing required env vars (defaults may exist in app code):', missingRequired.join(', '));
} else {
  console.log('All required env vars set.');
}

const missingOptional = optional.filter((key) => !process.env[key]);
console.log('Optional vars not set:', missingOptional.join(', ') || 'none');

if (!fs.existsSync('./apps/web/prisma/schema.prisma')) {
  console.error('Prisma schema is missing at apps/web/prisma/schema.prisma');
  process.exit(1);
}

console.log('Environment check completed.');
