// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "no-console": ["warn"],
    },
  },
  {
    ignores: [
      "node_modules",
      "dist",
      "coverage",
      "vite.config.ts",
      "vitest.config.ts",
      "src/__tests__/**",
      "eslint.config.mjs",
      "avclient-livekit.js",
    ],
  },
);
