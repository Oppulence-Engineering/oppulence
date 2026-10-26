import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule.js";
import { baselineLimit, type BaselineOptions } from "../utils.js";

// Tailwind arbitrary values that bypass the shared tokens in @oppulence/ui.
// Same pattern as WEB030 in @oppulence/eslint-plugin-web.
const RAW_DESIGN_VALUE = new RegExp(
  [
    // Colors: bg-[#fff], text-[rgb(0_0_0)]. Relative colors from a token are fine.
    String.raw`\b(?:bg|text|border|ring|outline|fill|stroke|decoration|divide|placeholder|caret|accent|shadow|from|via|to)(?:-[a-z]+)?-\[(?:#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\((?!from[_\s]))`,
    // Radius: rounded-[8px], rounded-tl-[4px].
    String.raw`\brounded(?:-[trblse]{1,2})?-\[\d`,
    // Font family: font-['Inter']. Weights (font-[510]) and var() are fine.
    String.raw`\bfont-\[(?!\d|var\()`,
  ].join("|"),
  "g",
);

export const noRawDesignValues = createRule<BaselineOptions, "raw">({
  name: "no-raw-design-values",
  meta: {
    type: "problem",
    docs: { description: "Class strings use design tokens, not raw colors, radii, or fonts." },
    schema: [
      {
        type: "object",
        properties: { baseline: { type: "object", additionalProperties: { type: "number" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      raw: "X021: use a token class (bg-background, text-muted-foreground, rounded-md, font-sans) instead of a raw color, radius, or font value. See packages/ui/DESIGN_SYSTEM.md.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const found: TSESTree.Node[] = [];
    const record = (node: TSESTree.Node, text: string) => {
      for (let i = text.match(RAW_DESIGN_VALUE)?.length ?? 0; i > 0; i -= 1) found.push(node);
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") record(node, node.value);
      },
      TemplateElement(node) {
        record(node, node.value.raw);
      },
      "Program:exit"() {
        const limit = baselineLimit(context.filename, options.baseline);
        for (const node of found.slice(limit)) context.report({ node, messageId: "raw" });
      },
    };
  },
});
