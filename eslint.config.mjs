import js from "@eslint/js";
import html from "eslint-plugin-html";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  localStorage: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  performance: "readonly"
};

const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  process: "readonly",
  __dirname: "readonly",
  console: "readonly"
};

export default [
  js.configs.recommended,
  {
    files: ["logic.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals
    }
  },
  {
    files: ["logic.test.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    }
  },
  {
    files: ["server.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: nodeGlobals
    }
  },
  {
    files: ["**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    ignores: ["node_modules/**"]
  }
];
