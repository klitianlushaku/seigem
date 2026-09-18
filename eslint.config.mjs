import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local package cache created when the global npm cache is unavailable.
    ".npm-cache/**",
  ]),
  {
    rules: {
      // Seigem: surface unused code and accidental `any` during development.
      // `no-explicit-any` is a warning rather than an error so that legitimate
      // narrowing at untrusted boundaries (webhooks, model JSON) stays readable.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer const and forbid `var` throughout the codebase.
      "prefer-const": "error",
      "no-var": "error",
      // Catch accidental `console.log` left in committed code. `warn`/`error`
      // are still allowed for genuine diagnostics.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Test files and fixture generators legitimately report progress.
    files: ["tests/**/*.ts", "tests/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // The extraction demo page logs timing/format diagnostics on purpose.
    files: ["src/app/**/nxjerrja/**/*.tsx"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Server modules log operational diagnostics (model, token usage, retries)
    // and must never log request or response content.
    files: ["src/server/**/*.ts", "src/app/api/**/*.ts"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
]);

export default eslintConfig;
