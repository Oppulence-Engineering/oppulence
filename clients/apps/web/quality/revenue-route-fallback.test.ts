import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/(product)/app/revenue/loading.tsx"),
  "utf8",
);

describe("revenue route fallback", () => {
  it("does not call notes, people, and tasks revenue while they load", () => {
    expect(source).toContain('label="Loading workspace…"');
    expect(source).not.toContain("Loading revenue");
  });
});
