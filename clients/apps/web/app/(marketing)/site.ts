import { comparePages } from "./compare-catalog";
import type { LinkItem } from "./marketing-data";

/** Public origin used for canonical URLs, sitemap, and structured data. */
export const SITE_URL = "https://oppulence.io";

export const SITE_NAME = "Oppulence";

export const ORGANIZATION_NAME = "Playbook Media";

export type NavLink = LinkItem & {
  href: string;
};

export type NavGroup = {
  label: string;
  href?: string;
  description?: string;
  items: NavLink[];
};

/**
 * Header groups for the public site. Every href here must resolve to a real
 * route. The list is intentionally smaller than the full footer map so the
 * bar stays scannable.
 */
export const headerNav: NavGroup[] = [
  {
    label: "Product",
    href: "/products",
    description: "One assistant across Web, Desktop, and Voice.",
    items: [
      {
        label: "The Oppulence assistant",
        href: "/product",
        description: "Email, relationships, meetings, and follow-through.",
      },
      {
        label: "Oppulence Web",
        href: "/web",
        description: "Your work, organized in a browser.",
      },
      {
        label: "Oppulence Desktop",
        href: "/desktop",
        description: "Your full workspace, with local files and native tools.",
      },
      {
        label: "Oppulence Voice",
        href: "/voice-app",
        description: "Optional dictation, thought capture, and meeting recording.",
      },
      {
        label: "Download",
        href: "/download",
        description: "macOS, Windows, and Linux installers.",
      },
    ],
  },
  {
    label: "Features",
    href: "/features",
    description: "Context, preparation, and follow-through.",
    items: [
      {
        label: "Follow-ups and commitments",
        href: "/features/commitment-register",
        description: "Keep your promises and outstanding requests in view.",
      },
      {
        label: "Relationship context",
        href: "/features/account-mission-control",
        description: "The emails, meetings, and notes behind a conversation.",
      },
      {
        label: "Work that needs you",
        href: "/features/attention-queue",
        description: "Open questions and follow-ups worth your attention.",
      },
      {
        label: "Review and approve",
        href: "/features/governed-actions",
        description: "Drafts wait for approval before anything is sent.",
      },
      {
        label: "Meeting capture",
        href: "/features/meeting-capture",
        description: "Local audio, on-device transcripts, commitments kept.",
      },
      {
        label: "Live notes",
        href: "/features/live-notes",
        description: "Notes that refresh themselves from a schedule or event.",
      },
      {
        label: "Local vault",
        href: "/features/local-vault",
        description: "Markdown you own, on your machine.",
      },
      {
        label: "Agents and workflows",
        href: "/features/agents",
        description: "Copilot, MCP tools, and background runs.",
      },
    ],
  },
  {
    label: "Use cases",
    href: "/use-cases",
    items: [
      {
        label: "Founder-operator",
        href: "/use-cases/founder-operator",
        description: "Prepare replies and keep unfinished work in view.",
      },
      {
        label: "Account management",
        href: "/use-cases/account-management",
        description: "Renewals, handovers, and the history that should travel.",
      },
      {
        label: "Meetings",
        href: "/use-cases/meetings",
        description: "Prepare for the conversation and review the follow-up.",
      },
      {
        label: "Research and verification",
        href: "/use-cases/research",
        description: "Confirm who you are talking to before you act.",
      },
    ],
  },
];

export const headerUtilityLinks: NavLink[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
];

export const footerGroups: { title: string; items: NavLink[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Products", href: "/products" },
      { label: "The Oppulence assistant", href: "/product" },
      { label: "Web", href: "/web" },
      { label: "Desktop", href: "/desktop" },
      { label: "Voice", href: "/voice-app" },
      { label: "Pricing", href: "/pricing" },
      { label: "Download", href: "/download" },
    ],
  },
  {
    title: "Features",
    items: [
      { label: "Follow-ups and commitments", href: "/features/commitment-register" },
      { label: "Relationship context", href: "/features/account-mission-control" },
      { label: "Work that needs you", href: "/features/attention-queue" },
      { label: "Review and approve", href: "/features/governed-actions" },
      { label: "Meeting capture", href: "/features/meeting-capture" },
      { label: "Live notes", href: "/features/live-notes" },
      { label: "Local vault", href: "/features/local-vault" },
      { label: "Agents", href: "/features/agents" },
    ],
  },
  {
    title: "Use cases",
    items: [
      { label: "Founder-operator", href: "/use-cases/founder-operator" },
      { label: "Account management", href: "/use-cases/account-management" },
      { label: "Meetings", href: "/use-cases/meetings" },
      { label: "Research", href: "/use-cases/research" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Resource hub", href: "/resources" },
      { label: "Guides", href: "/guides" },
      { label: "Changelog", href: "/changelog" },
      { label: "Integrations", href: "/integrations" },
      { label: "Security", href: "/security" },
      { label: "Compare", href: "/compare" },
      { label: "Answer hub", href: "/answers" },
      { label: "Blog", href: "/blog" },
      { label: "Customers", href: "/customers" },
    ],
  },
  {
    title: "Compare",
    items: comparePages.map((page) => ({
      label: page.eyebrow,
      href: page.path,
    })),
  },
  {
    title: "Company",
    items: [
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Responsible disclosure", href: "/responsible-disclosure" },
      {
        label: "Discord",
        href: "https://discord.gg/wajrgmJQ6b",
        external: true,
      },
    ],
  },
];

/** Dedicated marketing routes that live outside the catch-all slug table. */
export const dedicatedMarketingPaths = [
  "product",
  "products",
  "web",
  "desktop",
  "voice-app",
  "download",
  "security",
  "changelog",
  "contact",
  "resources",
  "features",
  "features/commitment-register",
  "features/account-mission-control",
  "features/attention-queue",
  "features/governed-actions",
  "features/meeting-capture",
  "features/live-notes",
  "features/local-vault",
  "features/agents",
  "use-cases",
  "use-cases/founder-operator",
  "use-cases/account-management",
  "use-cases/meetings",
  "use-cases/research",
  "integrations",
  "integrations/gmail",
  "integrations/calendar",
  "integrations/slack",
  "integrations/hubspot",
  "integrations/mcp",
  "guides",
  "guides/desktop-vs-web",
  "guides/what-stays-on-device",
  "guides/approval-before-send",
  "guides/install-oppulence",
  "pricing",
  "blog",
  "customers",
  "compare",
  "answers",
  ...comparePages.map((page) => page.path.slice(1)),
] as const;

export function absoluteUrl(path = ""): string {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
