// Lint for the app's JavaScript. Run: npx eslint .
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["vendor/**", "node_modules/**", ".venv/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, CatastoParser: "readonly", CatastoRecords: "readonly", CatastoStorage: "readonly" }
    }
  },
  {
    files: ["scene3d.js", "building-types.js"],
    languageOptions: { sourceType: "module" }
  },
  {
    files: ["**/*.test.mjs", "eslint.config.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } }
  }
];
