import eslint from "@eslint/js";
import globals from "globals";
import tsEslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import importPlugin from "eslint-plugin-import";

export default [
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  {
    files: ["**/*.ts", "eslint.config.js"],
    languageOptions: {
      parser: tsEslint.parser,
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@stylistic": stylistic,
      import: importPlugin
    }
  },
  {
    ignores: ["dist-esm/**/*", "node_modules"],
    rules: {
      "prefer-const": "error",
      "import/order": ["error", { groups: ["external", "internal"] }],
      "@stylistic/quotes": ["error", "double", { allowTemplateLiterals: "always" }],
      "@stylistic/quote-props": ["error", "as-needed"],
      "@stylistic/semi": ["error"],
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: {
            regex: "^I[A-Z]",
            match: false
          }
        }
      ],
      curly: ["error", "all"],
      "@stylistic/indent": ["error", 2],
      "@stylistic/arrow-parens": ["error", "as-needed"],
      "object-curly-spacing": ["error", "always"],
      "@stylistic/brace-style": "error",
      "id-length": ["error", { min: 3, exceptions: ["z", "_", "i", "fs", "id"] }],
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "no-restricted-syntax": [ "error", { selector: "VariableDeclarator > ArrowFunctionExpression", message: "Do not assign arrow functions to variables. Use a named function declaration instead." } ],
    }
  }
];
