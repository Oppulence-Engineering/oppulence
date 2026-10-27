import type { CapabilityPage } from "../../../catalog";
import type { MarketingPage } from "../../../marketing-data";
import { PlatformExplorer } from "./platform-explorer";
import { ProductHeroPreview } from "./product-hero-preview";
import { ProductModulePreview } from "./product-module-preview";
import type { ProductPreviewKey } from "./product-previews";
import type { SolutionsProductFeatureConfig, SolutionsProductPageConfig } from "./types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const CAPABILITY_HERO: Partial<Record<string, ProductPreviewKey>> = {
  "commitment-register": "register",
  "account-mission-control": "account",
  "attention-queue": "web",
  "governed-actions": "govern",
  "meeting-capture": "voice",
  "live-notes": "desktop",
  "local-vault": "desktop",
  agents: "desktop",
  "founder-operator": "web",
  "account-management": "account",
  meetings: "voice",
  research: "account",
  gmail: "register",
  calendar: "web",
  slack: "govern",
  hubspot: "account",
  mcp: "desktop",
};

/** Interactive showcase preview per capability slug. */
const CAPABILITY_SHOWCASE: Partial<Record<string, ProductPreviewKey | "register-interactive">> = {
  "commitment-register": "register-interactive",
  "governed-actions": "govern",
  "meeting-capture": "voice",
  "live-notes": "desktop",
  "attention-queue": "web",
  "account-mission-control": "account",
  gmail: "register",
  slack: "govern",
  hubspot: "account",
};

/** Two-up feature grid previews per slug — distinct pairs where possible. */
const CAPABILITY_GRID: Partial<Record<string, [ProductPreviewKey, ProductPreviewKey]>> = {
  "commitment-register": ["register", "account"],
  "governed-actions": ["govern", "register"],
  "meeting-capture": ["voice", "desktop"],
  "live-notes": ["desktop", "register"],
  "attention-queue": ["web", "account"],
  "account-mission-control": ["account", "web"],
  gmail: ["register", "govern"],
  calendar: ["web", "register"],
  slack: ["govern", "web"],
  hubspot: ["account", "register"],
  mcp: ["desktop", "govern"],
};

function modulePreview(
  product: ProductPreviewKey | "register-interactive",
  layout: "menu" | "stage" = "menu",
): SolutionsProductFeatureConfig["visual"] {
  return <ProductModulePreview layout={layout} product={product} />;
}

function featureBlock(
  id: string,
  label: string,
  title: string,
  description: string,
  product: ProductPreviewKey | "register-interactive",
  cta?: { label: string; href: string },
): SolutionsProductFeatureConfig {
  return {
    id,
    label,
    title,
    description,
    visual: modulePreview(product),
    cta,
  };
}

/** Map catalog pages to Sim `/knowledge` or `/tables` product layout with live previews. */
export function capabilityToSolutionsConfig(page: CapabilityPage): SolutionsProductPageConfig {
  const heroProduct = CAPABILITY_HERO[page.slug] ?? "register";
  const secondary = page.capabilities[0] ?? page.examples[0];
  const tertiary = page.capabilities[1] ?? page.examples[1] ?? page.capabilities[0];
  const [gridA, gridB] = CAPABILITY_GRID[page.slug] ?? [
    heroProduct === "register" ? "account" : "govern",
    heroProduct === "voice" ? "desktop" : "web",
  ];

  const showcaseProduct = CAPABILITY_SHOWCASE[page.slug] ?? heroProduct;

  return {
    module: page.eyebrow,
    path: page.path,
    seoDescription: page.description,
    hero: {
      eyebrow: page.eyebrow,
      heading: page.title,
      description: page.lede,
      summary: `${page.description} ${page.lede}`.trim(),
      visual: <ProductHeroPreview product={heroProduct} />,
    },
    features: [
      {
        id: "showcase",
        label: page.howItWorks.title,
        title: page.problem.title,
        description: page.howItWorks.body,
        visual: modulePreview(showcaseProduct, "stage"),
        cta: page.related[0]
          ? { label: page.related[0].label, href: page.related[0].href }
          : undefined,
      },
      secondary
        ? featureBlock(
            slugify(secondary.title),
            page.capabilities[0] ? "Capability" : "Example",
            secondary.title,
            secondary.body,
            gridA,
            page.related[1]
              ? { label: page.related[1].label, href: page.related[1].href }
              : undefined,
          )
        : featureBlock(
            "capability",
            "Capability",
            page.howItWorks.title,
            page.howItWorks.body,
            gridA,
          ),
      tertiary
        ? featureBlock(
            slugify(tertiary.title),
            page.capabilities[1] ? "Capability" : "Example",
            tertiary.title,
            tertiary.body,
            gridB,
            page.integrations?.[0]
              ? { label: page.integrations[0].label, href: page.integrations[0].href }
              : undefined,
          )
        : featureBlock("example", "Considerations", "What to consider.", page.problem.body, "web"),
    ],
  };
}

/** Map the assistant overview to the existing product layout. */
export function productToSolutionsConfig(page: MarketingPage): SolutionsProductPageConfig {
  return {
    module: "The assistant",
    path: "/product",
    seoDescription: page.description,
    hero: {
      eyebrow: "One assistant",
      heading: page.title,
      description: page.description,
      summary: [page.description, ...page.bullets].join(" "),
      visual: <ProductHeroPreview product="overview" />,
    },
    features: [
      {
        id: "explore",
        label: "The experience we are building",
        title: "From the meeting to the next reply.",
        description:
          "Prepare from earlier conversations. Capture with consent. Review the transcript and relationship matches. Bring that context into a reply, approve the action, and keep the follow-up visible until there is evidence it is done. The full Voice-to-memory handoff is in development.",
        visual: <PlatformExplorer />,
      },
      featureBlock(
        "context",
        "Relationship memory",
        "The person behind the thread.",
        "Bring earlier emails, meetings, open questions, and relevant notes into view. Inspect the source passage, correct a match, and decide what should influence a reply.",
        "account",
        { label: "Explore relationship context", href: "/features/account-mission-control" },
      ),
      featureBlock(
        "review",
        "Approval and outcomes",
        "Know what the assistant proposes.",
        "See what happened, the evidence behind it, and the proposed next step. External actions wait for approval. An execution attempt and a verified result must remain distinct.",
        "govern",
        { label: "Review and approve", href: "/features/governed-actions" },
      ),
      featureBlock(
        "memory",
        "Private notes and evidence",
        "Keep facts and interpretations distinct.",
        "A transcript records what someone said. A private note records your perspective. An assistant inference is a proposed interpretation. The connected experience must preserve those differences in replies and shared summaries.",
        "desktop",
        { label: "Understand local data", href: "/guides/what-stays-on-device" },
      ),
      featureBlock(
        "follow-up",
        "Follow-through",
        "Keep unfinished work in view.",
        "Track what you promised and what you are waiting for. The existing commitment register supports this work; the planned Today and Activity views will bring it into the everyday assistant experience.",
        "web",
        { label: "Explore follow-ups", href: "/features/commitment-register" },
      ),
    ],
  };
}
