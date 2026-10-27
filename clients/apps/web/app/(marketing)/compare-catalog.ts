import type { CatalogLink } from "./catalog";
import type { MarketingFaqItem } from "./marketing-faq";

export type ComparePage = {
  slug: string;
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  lede: string;
  them: { title: string; body: string };
  us: { title: string; body: string };
  rows: { label: string; them: string; us: string }[];
  notes: string[];
  faqs: MarketingFaqItem[];
  related: CatalogLink[];
};

export const comparePages: ComparePage[] = [
  {
    slug: "crm",
    path: "/compare/crm",
    eyebrow: "CRM",
    title: "Keep your CRM. Bring more context to the conversation.",
    description:
      "Oppulence brings authorized correspondence, meetings, notes, and CRM context into relationship review and proposed follow-ups.",
    lede: "This is a category seam, not a feature matrix against every CRM logo. HubSpot is the CRM we connect today. Salesforce is not in the first-party set.",
    them: {
      title: "What the pipeline is for.",
      body: "Stages, amounts, owners, activities. Useful. Incomplete. The delivery date conceded on a Friday call never becomes a field, because nobody is paid to type it in.",
    },
    us: {
      title: "What the register is for.",
      body: "Relationship history with sources, open requests, and proposed next steps. Connect HubSpot for relevant account context while keeping your pipeline there.",
    },
    rows: [
      { label: "Object", them: "Deal, company, activity", us: "Commitment with a source" },
      {
        label: "Direction",
        them: "Usually outbound pipeline",
        us: "What you owe and what they owe",
      },
      {
        label: "Evidence",
        them: "Notes you remembered to log",
        us: "Link back to mail, meeting, or CRM row",
      },
      { label: "Writes", them: "Native CRM edits", us: "Proposed notes and tasks, after approval" },
      { label: "Replacement?", them: "System of record for the sale", us: "No. Connect it." },
    ],
    notes: [
      "Should you replace HubSpot? No. Connect it. The deal stage stays there.",
      "Salesforce is not a first-party relationship connector in the current set.",
    ],
    faqs: [
      {
        question: "Should I replace HubSpot?",
        answer:
          "No. Connect it. The deal stage stays there. The sentence that closed the stage belongs on the ledger.",
      },
      {
        question: "Do you have a Salesforce connector?",
        answer:
          "Not in the first-party relationship set. HubSpot is the CRM source we implement today.",
      },
    ],
    related: [
      {
        label: "Commitment register",
        href: "/features/commitment-register",
        description: "The missing record.",
      },
      { label: "HubSpot", href: "/integrations/hubspot", description: "The CRM we connect." },
    ],
  },
  {
    slug: "meeting-notes",
    path: "/compare/meeting-notes",
    eyebrow: "Meeting notes",
    title: "Make the meeting useful when the next email arrives.",
    description:
      "Use meeting notes as context for the next conversation. Desktop supports meeting imports; the complete Voice-to-relationship handoff is in development.",
    lede: "We are not asking you to fire the recorder you already like. Desktop can pull Granola and Fireflies into Markdown. The job after that is still the agreement, three weeks later.",
    them: {
      title: "What a recorder is for.",
      body: "Join or capture the call. Produce a transcript and a summary. The file lives in that product's library. The next meeting starts from a search box.",
    },
    us: {
      title: "What capture is for here.",
      body: "Record the room you are already in — no bot. Audio can stay on disk. Whisper can run locally. Agreements can become ledger evidence when you are signed in.",
    },
    rows: [
      {
        label: "In the call",
        them: "Often a bot or a companion app",
        us: "Local capture. Nothing joins Zoom or Meet.",
      },
      {
        label: "Audio",
        them: "Usually uploaded to transcribe",
        us: "Stays on the machine until you transcribe or delete it",
      },
      {
        label: "Native capture",
        them: "Vendor-specific",
        us: "macOS sidecar on 14.2+. Other OS uses a fallback.",
      },
      {
        label: "After the call",
        them: "A transcript folder",
        us: "A note, and optionally a register row",
      },
      {
        label: "Keep your old tool?",
        them: "—",
        us: "Yes. Granola and Fireflies can land in the vault.",
      },
    ],
    notes: [
      "Oppulence Voice is the optional capture companion. Its planned connection brings reviewed artifacts to the same relationship memory.",
      "We will not advertise native capture as a Windows or Linux feature.",
    ],
    faqs: [
      {
        question: "Do I have to stop using Granola?",
        answer:
          "No. Desktop can pull those notes into the vault. Oppulence is not a replacement pitch for a recorder you already trust.",
      },
      {
        question: "Does capture work the same on Windows?",
        answer:
          "The app ships there. Native dual-track capture is a macOS sidecar. Other operating systems use a fallback recorder.",
      },
    ],
    related: [
      {
        label: "Meeting capture",
        href: "/features/meeting-capture",
        description: "How audio is handled.",
      },
      { label: "Meetings", href: "/use-cases/meetings", description: "The before and after." },
    ],
  },
  {
    slug: "inbox",
    path: "/compare/inbox",
    eyebrow: "Inbox",
    title: "Give the next reply the context it needs.",
    description:
      "Keep using Gmail while Oppulence helps review the relationship history, prepare a response, and track unfinished work.",
    lede: "If you connect one thing, connect Gmail. Access starts read-only. The current window is 6 months. That is a product limit.",
    them: {
      title: "What the inbox is for.",
      body: "Read and write messages in the email client you prefer. Your conversation stays in the mailbox you connected.",
    },
    us: {
      title: "What we take from the inbox.",
      body: "Use authorized threads alongside meetings and notes to understand a relationship. Prepare a follow-up with sources and review it before sending.",
    },
    rows: [
      {
        label: "Read window",
        them: "The whole mailbox, if you search it",
        us: "6 months of Gmail in the current connector",
      },
      { label: "Write", them: "You send", us: "gmail_draft and gmail_send, after approval" },
      { label: "Calendar", them: "A separate Google product", us: "Same Google OAuth start path" },
      { label: "System of record", them: "The thread", us: "The register, citing the thread" },
    ],
    notes: [
      "Outlook is not in the first-party relationship connector set. Voice mentions Microsoft calendar for that app's own meeting detection.",
    ],
    faqs: [
      {
        question: "Do you read the whole history of the account?",
        answer: "The current Gmail window is 6 months. That is intentional.",
      },
      {
        question: "Will it send without me?",
        answer: "No. A draft can be created. A send waits.",
      },
    ],
    related: [
      {
        label: "Gmail",
        href: "/integrations/gmail",
        description: "The first relationship source.",
      },
      {
        label: "Founder-operator",
        href: "/use-cases/founder-operator",
        description: "When the sent folder is the company.",
      },
    ],
  },
  {
    slug: "ai-assistants",
    path: "/compare/ai-assistants",
    eyebrow: "AI assistants",
    title: "An assistant built around the people you work with.",
    description:
      "Oppulence centers on relationship context from authorized emails, meetings, and notes, with review before external sends and writes.",
    lede: "The goal is continuity: one assistant, one relationship memory, and one action history across Web, Desktop, and Voice. That shared experience is still being connected.",
    them: {
      title: "What a generic assistant is for.",
      body: "A prompt, a model, a reply. Maybe a browser. The memory is the chat thread. External sends, if they exist, are easy to turn on and hard to trust.",
    },
    us: {
      title: "What the copilot is for here.",
      body: "Desktop chat with MCP and builtin tools. Web agents and workflows for definitions you want in the cloud. Writes to mail, Slack, calendar, or CRM stay behind the same approval boundary.",
    },
    rows: [
      {
        label: "Memory",
        them: "The conversation",
        us: "Vault files, live notes, and the signed-in register",
      },
      {
        label: "Tools",
        them: "Vendor plugins",
        us: "MCP in ~/.rowboat/config/mcp.json, plus builtin mail and files",
      },
      {
        label: "Background work",
        them: "Sometimes a scheduled prompt",
        us: "Desktop or API target. API path uses Temporal.",
      },
      { label: "Customer-facing send", them: "Often a toggle", us: "A draft. Then a person." },
      { label: "Local option", them: "Rarely a real vault", us: "BYOK and a folder you picked" },
    ],
    notes: [
      "This is not the older visual agent-builder in the legacy rowboat app.",
      "Money-moving MCP scopes in the managed registry are not a production claim.",
    ],
    faqs: [
      {
        question: "Is this just ChatGPT next to Gmail?",
        answer:
          "Oppulence is organized around relationship context and follow-through. Source review, private notes, and approval are part of that experience; the model helps prepare the work.",
      },
      {
        question: "Can I bring my own model?",
        answer: "Yes. First-run lets you sign in or bring your own keys and stay local.",
      },
    ],
    related: [
      { label: "Agents", href: "/features/agents", description: "Copilot, MCP, workflows." },
      {
        label: "Governed actions",
        href: "/features/governed-actions",
        description: "The write gate.",
      },
    ],
  },
];

export function getComparePage(slug: string) {
  return comparePages.find((page) => page.slug === slug);
}
