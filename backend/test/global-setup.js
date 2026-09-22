const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL not set in .env');
  }

  // Reset the test database to a clean slate so every test run starts from
  // the same state — no leftover data from a previous run masking a bug.
  const { Client } = require('pg');
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  const backendRoot = path.join(__dirname, '..');
  execSync('npx ts-node --transpile-only src/db/migrate.ts', {
    cwd: backendRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
  execSync('npx ts-node --transpile-only src/db/seed/systemRolesAndPermissions.ts', {
    cwd: backendRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
};
