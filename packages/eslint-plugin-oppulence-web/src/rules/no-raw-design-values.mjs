import { createRule, normalizedFilename } from "../rule-utils.mjs";

// Tailwind arbitrary values that bypass the shared tokens in @oppulence/ui.
export const RAW_DESIGN_VALUE = new RegExp(
  [
    // Colors: bg-[#fff], text-[rgb(0_0_0)], border-t-[oklch(...)]. Relative colors
    // derived from a token (oklch(from var(--primary) ...)) are fine.
    String.raw`\b(?:bg|text|border|ring|outline|fill|stroke|decoration|divide|placeholder|caret|accent|shadow|from|via|to)(?:-[a-z]+)?-\[(?:#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\((?!from[_\s]))`,
    // Radius: rounded-[8px], rounded-tl-[4px].
    String.raw`\brounded(?:-[trblse]{1,2})?-\[\d`,
    // Font family: font-['Inter'], font-[Georgia]. Weights (font-[510]) and var() are fine.
    String.raw`\bfont-\[(?!\d|var\()`,
  ].join("|"),
  "g",
);

function countMatches(text) {
  return text.match(RAW_DESIGN_VALUE)?.length ?? 0;
}

function baselineLimit(filename, baseline = {}) {
  for (const [file, count] of Object.entries(baseline)) {
    if (filename === file || filename.endsWith(`/${file}`)) return count;
  }
  return 0;
}

export default createRule({
  name: "no-raw-design-values",
  meta: {
    type: "problem",
    docs: {
      description: "WEB030: class strings use design tokens, not raw colors, radii, or fonts",
    },
    schema: [
      {
        type: "object",
        properties: { baseline: { type: "object", additionalProperties: { type: "number" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      raw: "WEB030 Use a token class (bg-background, text-muted-foreground, border-border, rounded-md, font-sans) instead of a raw color, radius, or font value. See packages/ui/DESIGN_SYSTEM.md.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const found = [];
    const record = (node, text) => {
      for (let i = countMatches(text); i > 0; i -= 1) found.push(node);
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") record(node, node.value);
      },
      TemplateElement(node) {
        record(node, node.value.raw);
      },
      "Program:exit"() {
        const limit = baselineLimit(normalizedFilename(context), options.baseline);
        for (const node of found.slice(limit)) context.report({ node, messageId: "raw" });
      },
    };
  },
});
