import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,

  // Backend (server.js) — CommonJS / Node
  {
    files: ["server.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node
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
  },

  // Frontend (public/*.js) — Script / Browser
  // sourceType "script" = escopo global compartilhado (como <script> tags)
  // no-undef e no-unused-vars desligados porque funções são
  // compartilhadas entre arquivos via escopo global
  {
    files: ["public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        google: "readonly",
        markerClusterer: "readonly",
        OverlappingMarkerSpiderfier: "readonly"
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "eqeqeq": ["warn", "always"],
      "no-var": "warn",
      "prefer-const": "warn",
      "no-console": "off",
      "semi": ["warn", "always"],
      "quotes": ["warn", "double"],
      "indent": ["warn", 2]
    }
  }
];