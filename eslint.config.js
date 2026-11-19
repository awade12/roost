import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const tsFiles = ["**/*.ts", "**/*.tsx"];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/migrations/**", "sdks/**", "**/.turbo/**", "apps/mobile/.expo/**", "apps/mobile/ios/**", "apps/mobile/android/**", "**/expo-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict.map((c) => ({ ...c, files: tsFiles })),
  {
    files: tsFiles,
    rules: {
      // SPEC "Code rules"
      "max-lines": ["error", { max: 500 }],
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        { selector: "ExportDefaultDeclaration", message: "Use named exports." },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@roost/*/src/*"], message: "Import a package's public entry, not its internals." }] },
      ],
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    files: ["apps/dashboard/**/*.tsx", "apps/dashboard/**/*.ts", "apps/mobile/**/*.tsx", "apps/mobile/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
  {
    // Tools that require a default export; Expo Router reads each route file's default export.
    files: ["**/*.config.ts", "**/*.config.js", "eslint.config.js", "apps/mobile/src/app/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Metro, Babel and Tailwind load these as CommonJS.
    files: ["apps/mobile/*.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly", __dirname: "readonly" } },
  },
  {
    // Worker logs JSON lines to stdout until it gets pino; scripts print results.
    // Command-line tools: printing is their output.
    files: ["apps/worker/**", "scripts/**", "packages/cli/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/__tests__/**"],
    rules: { "max-lines-per-function": "off" },
  },
);
