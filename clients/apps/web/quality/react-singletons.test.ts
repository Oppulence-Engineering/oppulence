import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lock = JSON.parse(fs.readFileSync(path.join(appRoot, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string }>;
};

describe("vendored workflow React singletons", () => {
  it("resolves React and React Flow from the app copy", () => {
    const singletons = ["react", "react-dom", "@xyflow/react"];
    const vendors = ["emcn", "workflow-renderer", "workflow-types"];

    for (const dependency of singletons) {
      expect(lock.packages[`node_modules/${dependency}`]).toBeDefined();
      for (const vendor of vendors) {
        expect(
          lock.packages[`vendor/sim/${vendor}/node_modules/${dependency}`],
          `${vendor} must share the app's ${dependency} provider and hooks`,
        ).toBeUndefined();
      }
    }
  });
});
