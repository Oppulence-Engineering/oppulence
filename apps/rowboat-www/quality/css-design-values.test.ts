import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * WEB031: CSS uses the shared design tokens. Raw colors and font stacks in
 * CSS are legacy debt. `css-design-values-baseline.json` records the exact
 * count per file, so the count can only go down. tokens.css and polar.css
 * define the primitives and are exempt.
 *
 * After you remove raw values, refresh the baseline:
 *   UPDATE_CSS_BASELINE=1 npx vitest run quality/css-design-values.test.ts
 */

const REPO = path.resolve(import.meta.dirname, "../../..");
const ROOTS = [
  "apps/rowboat-www/app",
  "apps/rowboat-www/components",
  "packages/ui/src/styles",
  "apps/x/apps/renderer/src",
];
const EXEMPT = new Set(["packages/ui/src/styles/tokens.css", "packages/ui/src/styles/polar.css"]);
const BASELINE_FILE = path.join(import.meta.dirname, "css-design-values-baseline.json");

// Hex colors and color functions. Relative colors derived from a token are fine.
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\((?!\s*from\s)/g;
// A font stack that does not start from a token or inheritance.
const RAW_FONT = /font-family\s*:(?!\s*(?:var\(|inherit|initial|unset))[^;}]+/g;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

function countRawValues(css: string) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "url()");
  return (code.match(RAW_COLOR)?.length ?? 0) + (code.match(RAW_FONT)?.length ?? 0);
}

function currentCounts() {
  const counts: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const file of cssFiles(path.join(REPO, root))) {
      const rel = path.relative(REPO, file).split(path.sep).join("/");
      if (EXEMPT.has(rel)) continue;
      const count = countRawValues(readFileSync(file, "utf8"));
      if (count > 0) counts[rel] = count;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

describe("CSS design values (WEB031)", () => {
  it("counts hex, color functions, and raw font stacks", () => {
    expect(countRawValues("a { color: #fff; background: rgb(0 0 0 / 5%); }")).toBe(2);
    expect(countRawValues("a { font-family: Georgia, serif; }")).toBe(1);
    expect(
      countRawValues(
        "/* #fff */ a { color: var(--foreground); font-family: var(--typeface-sans); background: oklch(from var(--primary) l c h); mask: url(#m); }",
      ),
    ).toBe(0);
  });

  it("keeps raw colors and fonts in CSS at or below the recorded baseline", () => {
    const counts = currentCounts();
    if (process.env.UPDATE_CSS_BASELINE) {
      writeFileSync(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`);
    }
    const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Record<string, number>;
    const grew = Object.entries(counts)
      .filter(([file, count]) => count > (baseline[file] ?? 0))
      .map(([file, count]) => `${file}: ${baseline[file] ?? 0} -> ${count}`);
    const shrank = Object.entries(baseline)
      .filter(([file, count]) => (counts[file] ?? 0) < count)
      .map(([file, count]) => `${file}: ${count} -> ${counts[file] ?? 0}`);
    expect(grew, "Use tokens from @oppulence/ui instead of raw values").toEqual([]);
    expect(shrank, "Raw values went down. Refresh the baseline (see file header)").toEqual([]);
  });
});
