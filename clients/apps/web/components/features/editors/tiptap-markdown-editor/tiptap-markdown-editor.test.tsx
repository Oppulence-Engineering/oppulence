import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "tiptap-markdown-editor.tsx"),
  "utf8",
);

describe("TiptapMarkdownEditor", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function TiptapMarkdownEditor");
  });

  it("asks for a link in the product dialog", () => {
    expect(source).not.toContain("window.prompt");
    expect(source).toContain("Paste or type a link");
    expect(source).toContain('htmlFor="markdown-link-url"');
    expect(source).toContain("Apply link");
  });
});
