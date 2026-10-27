import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const eslint = new ESLint({ cwd: appRoot });

describe("ESLint configuration", () => {
  it.each(["browser.ts", "dynamic.ts", "server.ts"])(
    "ignores the generated Fumadocs source %s",
    async (filename) => {
      await expect(eslint.isPathIgnored(path.join(appRoot, ".source", filename))).resolves.toBe(
        true,
      );
    },
    // The first call loads the full ESLint config (about 3s alone). Under the
    // parallel suite it can pass the 5s default.
    20_000,
  );
});
