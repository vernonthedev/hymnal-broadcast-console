import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", "out/**"],
    },
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_" },
            ],
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "no-undef": "off",
        },
    },
    {
        files: ["**/*.cjs", "electron/preload.ts"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
    {
        files: ["electron/renderer/**/*.ts", "electron/renderer/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ["scripts/**/*.ts", "**/*.cjs"],
        languageOptions: {
            globals: {
                ...globals.node,
                module: "readonly",
                __dirname: "readonly",
            },
        },
    }
);
