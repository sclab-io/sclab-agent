const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    // uuid@13 (via @databricks/sql -> thrift) is ESM-only; Node < 24.9 cannot require() it under Jest
    '^.+/node_modules/(?:thrift/node_modules/)?uuid/.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true, module: 'commonjs' } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(?:thrift/node_modules/)?uuid/)'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/src' }),
  // Cache Jest files in local directory to avoid permission issues
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
};
