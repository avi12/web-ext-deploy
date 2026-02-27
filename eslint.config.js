import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import importNewlines from "eslint-plugin-import-newlines";
import perfectionist from "eslint-plugin-perfectionist";
import globals from "globals";
import tsEslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}", "eslint.config.js"],
    languageOptions: {
      parser: tsEslint.parser,
      globals: { ...globals.node }
    },
    plugins: {
      "@stylistic": stylistic,
      "import-newlines": importNewlines,
      perfectionist
    }
  },
  {
    ignores: ["dist-esm/**/*", "node_modules"],
    rules: {
      "prefer-const": "error",
      "perfectionist/sort-imports": [
        "error",
        {
          type: "alphabetical",
          order: "asc",
          newlinesBetween: "ignore",
          sortSideEffects: true,
          groups: [
            ["side-effect", "builtin", "external", "internal", "parent", "sibling", "index", "unknown"]
          ]
        }
      ],
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
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@stylistic/brace-style": "error",
      "@stylistic/comma-dangle": ["error", "never"],
      "@stylistic/no-trailing-spaces": "error",
      "@stylistic/eol-last": ["error", "always"],
      "@stylistic/no-multiple-empty-lines": ["error", {
        max: 1, maxEOF: 0, maxBOF: 0
      }],
      "@stylistic/comma-spacing": ["error", { before: false, after: true }],
      "@stylistic/key-spacing": ["error", { beforeColon: false, afterColon: true }],
      "@stylistic/keyword-spacing": ["error", { before: true, after: true }],
      "@stylistic/space-before-blocks": "error",
      "@stylistic/space-before-function-paren": ["error", {
        named: "never",
        asyncArrow: "always",
        catch: "always"
      }],
      "@stylistic/space-infix-ops": "error",
      "@stylistic/space-in-parens": ["error", "never"],
      "@stylistic/array-bracket-spacing": ["error", "never"],
      "@stylistic/computed-property-spacing": ["error", "never"],
      "@stylistic/template-curly-spacing": ["error", "never"],
      "@stylistic/block-spacing": ["error", "always"],
      "@stylistic/semi-spacing": ["error", { before: false, after: true }],
      "@stylistic/no-extra-semi": "error",
      "@stylistic/type-annotation-spacing": "error",
      "@stylistic/member-delimiter-style": ["error", { multiline: { delimiter: "semi", requireLast: true }, singleline: { delimiter: "semi", requireLast: false } }],
      "@stylistic/no-mixed-spaces-and-tabs": "error",
      "@stylistic/padded-blocks": ["error", "never"],
      "@stylistic/rest-spread-spacing": ["error", "never"],
      "@stylistic/spaced-comment": ["error", "always"],
      "import-newlines/enforce": ["error", { items: 4, "max-len": 120 }],
      "@stylistic/object-curly-newline": ["error", {
        ObjectExpression: { multiline: true, minProperties: 4 },
        ObjectPattern: { multiline: true, minProperties: 4 },
        ExportDeclaration: "never"
      }],
      "@stylistic/object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],
      "id-length": ["error", { min: 3, exceptions: ["z", "_", "i", "fs", "id", "os"] }],
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "no-restricted-syntax": ["error",
        { selector: "VariableDeclarator > ArrowFunctionExpression", message: "Do not assign arrow functions to variables. Use a named function declaration instead." },
        { selector: "ForOfStatement > CallExpression[callee.object.name='Object'][callee.property.name='keys']", message: "Use a for-in loop instead of for-of Object.keys()." }
      ],
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always", prev: "import", next: ["const", "let", "function", "export", "type"]
        },
        {
          blankLine: "any", prev: "import", next: "import"
        }
      ],
      "object-shorthand": ["error", "always", { avoidExplicitReturnArrows: true }],
      "perfectionist/sort-objects": [
        "error",
        {
          type: "unsorted",
          newlinesBetween: 0
        }
      ],
      "no-nested-ternary": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }
      ]
    }
  },
  {
    files: ["*.config.ts", "*.config.js"],
    rules: {
      "@stylistic/object-curly-newline": ["error", {
        ObjectExpression: { multiline: true, consistent: true },
        ObjectPattern: { multiline: true, consistent: true },
        ExportDeclaration: "never"
      }]
    }
  }
];
