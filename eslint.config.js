import eslint from "@eslint/js";
import avi12 from "eslint-config-avi12";
import globals from "globals";
import tsEslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  ...avi12,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsEslint.parser,
      globals: {
        ...globals.node
      }
    }
  },
  {
    ignores: ["dist-esm/**/*", "node_modules"],
    rules: {
      "prefer-const": "warn",
      quotes: ["warn", "double", { allowTemplateLiterals: true }],
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/ban-types": "off",
      "import/extensions": ["warn", "ignorePackages", { js: "always" }]
    }
  }
];
