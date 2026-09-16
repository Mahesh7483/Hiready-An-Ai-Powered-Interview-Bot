const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

/**
 * Lints <repo>/tests, which neither package's config can reach.
 *
 * ESLint refuses to lint a file outside its config file's base path — its own
 * error says so, and prescribes exactly this: put a config in a parent
 * directory. Moving the suites out of the packages therefore left them
 * unlinted, silently, until someone checked.
 *
 * Deliberately narrow: this lints tests/ and nothing else. Each package keeps
 * its own config for its own source, and this does not shadow them.
 */
const TEST_GLOBALS = {
  describe: "readonly",
  test: "readonly",
  it: "readonly",
  expect: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  jest: "readonly",
  vi: "readonly",
};

const NODE_GLOBALS = {
  console: "readonly",
  process: "readonly",
  require: "readonly",
  module: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  Promise: "readonly",
  fetch: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  AbortController: "readonly",
  AbortSignal: "readonly",
  localStorage: "readonly",
};

module.exports = [
  {
    // Everything except tests/ belongs to a package with its own config.
    ignores: [
      "hiready-backend/**",
      "hiready-frontend/**",
      "node_modules/**",
      ".github/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...NODE_GLOBALS, ...TEST_GLOBALS },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "warn",
      "no-undef": "error",
    },
  },
  {
    // The frontend suites are TypeScript and ESM, so they need the TS parser —
    // without it eslint fails on the first type annotation. Types themselves
    // are checked by tsc -b, verified by planting an error in a moved test and
    // watching the build fail.
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...NODE_GLOBALS, ...TEST_GLOBALS },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
