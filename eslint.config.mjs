import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  { 
    files: ["**/*.js"], 
    languageOptions: { 
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.browser  // Adiciono browser também porque você tem frontend
      }
    },
    rules: {
      "eqeqeq": ["warn", "always"],
      "no-var": "warn",
      "prefer-const": "warn",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "semi": ["warn", "always"],
      "quotes": ["warn", "double"],
      "indent": ["warn", 2]
    }
  }
];