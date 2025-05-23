const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = compat.config({
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    warnOnUnsupportedTypeScriptVersion: false,
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'cert/',
    'logs/',
    'agent.db',
    '.env',
    'docker-compose.yml',
    'Dockerfile',
    'build.sh',
    'run_app.sh',
    'ecosystem.config.js',
    'jest.config.js',
    'eslint.config.cjs',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
  ],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-empty-function': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
});