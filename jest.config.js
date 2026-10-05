module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  setupFiles: ['<rootDir>/test/env.setup.ts'],
  globalSetup: '<rootDir>/test/global-setup.js',
  testTimeout: 30000,
  maxWorkers: 1,
};
