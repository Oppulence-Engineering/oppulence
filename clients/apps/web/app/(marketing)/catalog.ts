import type { MarketingFaqItem } from "./marketing-faq";

export type CatalogLink = {
  label: string;
  href: string;
  description?: string;
};

export type CatalogSection = {
  title: string;
  body: string;
};

export type CapabilityPage = {
  kind: "feature" | "use-case" | "integration" | "guide";
  slug: string;
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  lede: string;
  screenshot: string;
  screenshotAlt: string;
  problem: CatalogSection;
  howItWorks: CatalogSection;
  workflow: string[];
  capabilities: CatalogSection[];
  examples: CatalogSection[];
  integrations?: CatalogLink[];
  security?: string;
  faqs: MarketingFaqItem[];
  related: CatalogLink[];
};

const screenshot = {
  webList: "/marketing/relationship-web-list.png",
  webDetail: "/marketing/relationship-web-detail.png",
  desktop: "/marketing/relationship-desktop.png",
  desktopDetail: "/marketing/relationship-desktop-detail.png",
  desktopHome: "/marketing/desktop-home.png",
  chat: "/marketing/desktop-chat.png",
  email: "/marketing/desktop-email.png",
  knowledge: "/marketing/desktop-knowledge.png",
  tasks: "/marketing/desktop-background-tasks.png",
  meetings: "/marketing/desktop-meetings.png",
  connections: "/marketing/desktop-connections.png",
} as const;

export const homepageFaqs: MarketingFaqItem[] = [
  {
    question: "What is Oppulence?",
    answer:
      "Oppulence is an email-first personal assistant built around your relationships. It brings together conversations, meetings, and notes to help you understand the context, prepare a reply, and follow through. We are connecting Web, Desktop, and Voice around one assistant and one history of actions.",
  },
  {
    question: "Do I need to install Desktop or Voice?",
    answer:
      "No. Start with Oppulence Web in your browser. Desktop adds local files and native tools. Voice is an optional companion for dictation, thought capture, and meetings. Desktop and Voice have separate installers today.",
  },
  {
    question: "What is available today, and what is planned?",
    answer:
      "Desktop includes email, local notes, meeting capture, live notes, background tasks, and an embedded browser. Web and the shared API provide relationship views, assistant work, and approval flows, subject to rollout. Common Today, Inbox, People, Library, and Activity navigation, the full web inbox experience, Ask Oppulence in Voice, and the complete Voice-to-relationship handoff are planned improvements.",
  },
  {
    question: "Can I keep using my existing email app?",
    answer:
      "You can keep using Gmail alongside the connected assistant. Desktop also has an email view. Voice can dictate into other apps, including Outlook, but dictation does not connect that app as a relationship data source. Outlook is not in the current first-party relationship connector set.",
  },
  {
    question: "Will it send a reply without my approval?",
    answer:
      "The governed action flow holds external sends and writes for your review. Check the proposed content and sources before approving. A prepared draft, an attempted action, and a verified result are different states.",
  },
  {
    question: "Are private notes treated as facts?",
    answer:
      "A private note is your perspective, not evidence that a customer said something. The shared experience is being built to distinguish source evidence, private notes, and assistant inferences, with uncertain identities and interpretations open to correction.",
  },
  {
    question: "What leaves my device?",
    answer:
      "It depends on the capability and provider you select. Local transcription can keep audio on your device; a cloud model receives content needed for its request. The connected experience must preserve explicit artifact sharing. Signing in is not consent to upload every private note. See the privacy and local-data guides for current behavior.",
  },
  {
    question: "What can I connect?",
    answer:
      "The public relationship connector catalog covers Gmail, Google Calendar, Slack, and HubSpot. Desktop also supports local notes, meeting imports, and MCP tools. Availability and permitted actions depend on the connector and rollout stage.",
  },
];

export const featurePages: CapabilityPage[] = [
  {
    kind: "feature",
    slug: "commitment-register",
    path: "/features/commitment-register",
    eyebrow: "Follow-ups and commitments",
    title: "Keep track of what still needs to happen.",
    description:
      "Keep your promises and outstanding requests visible, with the original conversation attached.",
    lede: "A meeting ends, a reply arrives, and the next step can get lost. The commitment register is one way the assistant helps you keep unfinished work in view.",
    screenshot: screenshot.webDetail,
    screenshotAlt:
      "An Oppulence account record showing a promised security review, its evidence timeline, and what changed",
    problem: {
      title: "Promises are made in conversation and then disappear.",
      body: "A scope change in email, a date in Slack, a discount tied to a case study that never got written. Those obligations are created by one person and kept by another. They are only noticed when they break.",
    },
    howItWorks: {
      title: "Read the history. Write a register.",
      body: "Oppulence reads recent Gmail, calendar, Slack, and HubSpot history, then records outbound and inbound commitments with evidence links, a lifecycle, and an outcome. You can correct a row. The correction beats the inference.",
    },
    workflow: [
      "Connect Gmail. Add calendar, Slack, or HubSpot when you want those traces too.",
      "Oppulence scans the last 180 days of mail and calendar in the current connector set.",
      "Each finding is a commitment with a direction, a date if one was said, and a link back to the source.",
      "You review the register. Silence, a missed date, or a money-state change moves the row into the attention queue.",
    ],
    capabilities: [
      {
        title: "Two directions",
        body: "What your team promised, and what the customer or vendor promised back. Inbound obligations are not treated as nice-to-haves.",
      },
      {
        title: "Evidence on the row",
        body: "Every recommendation carries a reason and a source. If the source is missing, the row says so instead of hiding it.",
      },
      {
        title: "Lifecycle, not a sticky note",
        body: "Open, at risk, kept, slipped, cancelled. Outcomes feed the next ranking instead of disappearing into a done column.",
      },
    ],
    examples: [
      {
        title: "The security review from March",
        body: "Someone promised a review to close a deal. The review never got a ticket. The register still has the date and the thread.",
      },
      {
        title: "The vendor SLA nobody tracked",
        body: "A supplier committed to a migration window in email. Oppulence keeps the inbound promise visible until it is met or explicitly dropped.",
      },
    ],
    integrations: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "Calendar", href: "/integrations/calendar" },
      { label: "Slack", href: "/integrations/slack" },
      { label: "HubSpot", href: "/integrations/hubspot" },
    ],
    security:
      "Connector reads are explicit and start read-only. The register lives with your signed-in workspace. Local notes you never sync stay on the desktop.",
    faqs: [
      {
        question: "Is this a CRM?",
        answer:
          "No. A CRM is the system of record for what you sold. The register is the system of record for what is owed. They can sit next to each other; Oppulence does not try to replace the deal pipeline.",
      },
      {
        question: "How far back does it read?",
        answer:
          "The current connector windows are 180 days of Gmail and calendar, 90 days of Slack, and 365 days of HubSpot. That is a product limit, not a marketing one.",
      },
    ],
    related: [
      {
        label: "Account mission control",
        href: "/features/account-mission-control",
        description: "Open one account and see the whole trail.",
      },
      {
        label: "Attention queue",
        href: "/features/attention-queue",
        description: "Which rows need a person this week.",
      },
      { label: "Why not a CRM", href: "/compare/crm", description: "The seam a CRM cannot cover." },
    ],
  },
  {
    kind: "feature",
    slug: "account-mission-control",
    path: "/features/account-mission-control",
    eyebrow: "Relationship context",
    title: "Remember the person behind the conversation.",
    description:
      "Bring emails, meetings, participants, and open questions into one relationship history, with the sources available to inspect.",
    lede: "Before you prepare a reply, find what was last discussed and what remains unresolved. The existing relationship views are the foundation for the planned People experience.",
    screenshot: screenshot.desktopDetail,
    screenshotAlt:
      "Oppulence account detail with a drafted follow-up held at an approve or reject gate",
    problem: {
      title: "Account history is scattered on purpose.",
      body: "Email has the concession. The CRM has the stage. The calendar has the QBR. Slack has the escalation. Nobody is paid to assemble that into one picture before a renewal call.",
    },
    howItWorks: {
      title: "The history behind the next reply.",
      body: "Review correspondence, people, and recent changes together. Open the original evidence before using it in a response, and keep your private interpretation distinct from what the source says.",
    },
    workflow: [
      "Pick an account from the ranked list or search.",
      "Read what changed, what is owed in both directions, and who went quiet.",
      "Open the source if you want to check the wording.",
      "Approve a draft, edit it, or leave it. The outcome goes back on the record.",
    ],
    capabilities: [
      {
        title: "Change, not last touch",
        body: "A reply, a missed date, a closed-won that still has open promises — those move the account. Recency alone does not.",
      },
      {
        title: "People on the thread",
        body: "Participants stay attached to the account so a handover does not start from a blank page.",
      },
      {
        title: "The next move is reviewable",
        body: "A draft sits next to the evidence. Nothing leaves until you say so.",
      },
    ],
    examples: [
      {
        title: "Monday after a quiet weekend",
        body: "An account that went silent after a proposal sits at the top with the dollar amount and the last promise attached.",
      },
      {
        title: "Handover on a Thursday",
        body: "A new owner opens the account and sees the objections, the open dates, and who actually cares, without asking the last owner for a brain dump.",
      },
    ],
    integrations: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "HubSpot", href: "/integrations/hubspot" },
      { label: "Slack", href: "/integrations/slack" },
    ],
    security:
      "You see the same relationship state on web and desktop when signed in. Writes back to mail, Slack, or CRM stay behind the approval gate.",
    faqs: [
      {
        question: "Does this replace my account plan doc?",
        answer:
          "It can sit next to it. Local notes in the desktop vault can be searched with the account. The ledger does not overwrite a note you wrote on purpose.",
      },
    ],
    related: [
      {
        label: "Commitment register",
        href: "/features/commitment-register",
        description: "The rows underneath the account.",
      },
      {
        label: "Governed actions",
        href: "/features/governed-actions",
        description: "How a draft becomes a send.",
      },
      {
        label: "Account management",
        href: "/use-cases/account-management",
        description: "The weekly job this view is for.",
      },
    ],
  },
  {
    kind: "feature",
    slug: "attention-queue",
    path: "/features/attention-queue",
    eyebrow: "Work that needs you",
    title: "Know which conversation needs your attention.",
    description:
      "Review open requests, missed dates, and conversations waiting on a response, with a reason for each proposed next step.",
    lede: "The existing attention queue helps identify unfinished work. The planned Today view will bring that work together with prepared replies, approvals, and upcoming meetings.",
    screenshot: screenshot.webList,
    screenshotAlt:
      "Oppulence account mission control ranking accounts by what changed and what is owed",
    problem: {
      title: "Last-touch sorts hide the expensive silence.",
      body: "The account that emailed yesterday looks healthy. The one that went quiet after a verbal yes does not. Activity feeds reward motion, not risk.",
    },
    howItWorks: {
      title: "Explainable rank, not a mystery score.",
      body: "Each queue item says what changed, which commitment is open, and why it rose. You can disagree. The disagreement is useful — it teaches the next ranking.",
    },
    workflow: [
      "Open the queue on Monday. The weekend's replies and missed dates are already applied.",
      "Read the reason on each row before you open the account.",
      "Take the ones that are actually yours. Leave the rest.",
      "Approved actions and outcomes change the next ranking.",
    ],
    capabilities: [
      {
        title: "Short by design",
        body: "The useful version of this list is three to five rows that deserve a person, not a hundred scored accounts.",
      },
      {
        title: "Reasons you can check",
        body: "Silence, a slipped date, a money-state change, a new participant. The reason is on the row.",
      },
      {
        title: "Web keeps watching",
        body: "Cloud background runs update the queue while the laptop is shut. Desktop can work the same queue beside the inbox.",
      },
    ],
    examples: [
      {
        title: "Ghosted proposal",
        body: "A proposal went out three weeks ago. No reply, no meeting, still an open number. The queue puts it above the accounts that chatted yesterday.",
      },
    ],
    integrations: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "Calendar", href: "/integrations/calendar" },
      { label: "HubSpot", href: "/integrations/hubspot" },
    ],
    faqs: [
      {
        question: "Can I filter to my patch?",
        answer:
          "Yes. Web is built for a shared book and a personal patch. The same relationship state is on the desktop if you would rather work next to the inbox.",
      },
    ],
    related: [
      {
        label: "Account mission control",
        href: "/features/account-mission-control",
        description: "Open the row.",
      },
      {
        label: "Founder-operator",
        href: "/use-cases/founder-operator",
        description: "When the queue is the whole company.",
      },
    ],
  },
  {
    kind: "feature",
    slug: "governed-actions",
    path: "/features/governed-actions",
    eyebrow: "Review and approve",
    title: "Review the reply before it leaves.",
    description:
      "Email, Slack, calendar, and CRM writes are proposed, checked, and held until a person approves them.",
    lede: "The useful assistant is the one that waits. Oppulence will draft a follow-up from the account history. It will not mail it under your name until you say so.",
    screenshot: screenshot.desktopDetail,
    screenshotAlt:
      "A drafted follow-up held at an approve or reject gate, with the evidence in view",
    problem: {
      title: "Autopilot email is how you lose the room.",
      body: "A bounced contact, someone who opted out, a person who changed roles, a thread that already answered the question. Sending first and explaining later is how relationship tools get turned off.",
    },
    howItWorks: {
      title: "Propose, check, approve, then act.",
      body: "A recommended action is a draft with a source. Policy and contact checks run before the approve button is useful. The outcome — sent, edited, rejected — goes back on the ledger.",
    },
    workflow: [
      "A queue item or account suggests a next move.",
      "Oppulence drafts the action against Gmail, Slack, calendar, or HubSpot.",
      "You read the draft next to the evidence.",
      "Approve, edit, or dismiss. Only then does anything leave.",
    ],
    capabilities: [
      {
        title: "Gmail drafts and sends",
        body: "A follow-up can be created as a draft or, after approval, sent. It is still your mailbox.",
      },
      {
        title: "Slack and HubSpot writes",
        body: "A Slack message, a CRM note, or a CRM task can be proposed the same way. Writes are progressive — you connect them when you want them.",
      },
      {
        title: "An audit trail you can export",
        body: "What was proposed, who approved it, and what happened is part of the record, not a log you lose at the vendor.",
      },
    ],
    examples: [
      {
        title: "The follow-up that should wait",
        body: "The contact bounced last quarter. The draft is useful. The send is blocked until a person picks a different address.",
      },
    ],
    integrations: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "Slack", href: "/integrations/slack" },
      { label: "HubSpot", href: "/integrations/hubspot" },
    ],
    security:
      "Connector writes are approval-gated. Money-moving MCP scopes are limited to development and staging environments and are not a production claim.",
    faqs: [
      {
        question: "Can I turn writes off?",
        answer:
          "Yes. Connections start as reads. You add write scopes when you want drafts that can actually go out.",
      },
      {
        question: "What if the draft is wrong?",
        answer:
          "Edit it or reject it. The rejection is a signal. The ledger should get sharper, not more confident.",
      },
    ],
    related: [
      {
        label: "Approval before send",
        href: "/guides/approval-before-send",
        description: "The rule in plain language.",
      },
      { label: "Security", href: "/security", description: "What is approved, and what never is." },
    ],
  },
  {
    kind: "feature",
    slug: "meeting-capture",
    path: "/features/meeting-capture",
    eyebrow: "Meeting capture",
    title: "Carry the conversation into the next step.",
    description:
      "Capture meetings, review transcripts and notes, and prepare follow-ups. Voice owns the floating capture experience; the complete relationship handoff is in development.",
    lede: "Record with appropriate consent, then check the transcript and speaker labels. Local transcription is available. Sharing a recording or note with Oppulence is a separate decision.",
    screenshot: screenshot.meetings,
    screenshotAlt: "Oppulence Desktop meeting capture and notes on the local machine",
    problem: {
      title: "The value continues after the call.",
      body: "The next email may depend on a decision, an open question, or a promised date from the meeting. Keep those points linked to what was actually said.",
    },
    howItWorks: {
      title: "Capture locally. Keep the agreement.",
      body: "On macOS 14.2 and later, a native sidecar records mic and system audio. Other platforms use a renderer fallback. Whisper runs on the machine. Notes land in the vault. Capture delivery and relationship history are separate steps; review and projection of Voice artifacts remain integration work.",
    },
    workflow: [
      "Start capture from the desktop app. Nothing joins the Zoom or Meet call as a bot.",
      "Audio is written to disk. Retention is yours to configure.",
      "Transcription runs locally with the bundled Whisper CLI.",
      "Agreements become notes and, if you want, relationship evidence.",
    ],
    capabilities: [
      {
        title: "Dual-track audio",
        body: "Your microphone and the system audio are separate tracks, which is what makes speaker-aware notes possible later.",
      },
      {
        title: "On-device transcription",
        body: "Release builds stage per-architecture whisper-cli binaries. You can also point at a cloud engine if you want speed more than locality.",
      },
      {
        title: "Pairs with Voice",
        body: "Voice is the optional companion for global dictation and capture. Desktop is the full workspace. The planned connection brings reviewed Voice artifacts into the same relationship history.",
      },
    ],
    examples: [
      {
        title: "The date said out loud",
        body: "A customer says 'end of month' on the call. That date should still be on the account in October, not buried in a transcript folder.",
      },
    ],
    integrations: [
      { label: "Local vault", href: "/features/local-vault" },
      { label: "Oppulence Voice", href: "/voice-app" },
    ],
    security:
      "Audio stays on the machine until you transcribe or delete it. Native crash dumps are not uploaded; crash metadata can go to PostHog if analytics is enabled.",
    faqs: [
      {
        question: "Does this work on Windows and Linux?",
        answer:
          "The desktop app ships there. Native capture is a macOS sidecar. Other operating systems use a fallback recorder, not the same low-level path.",
      },
      {
        question: "Do you join the meeting as a bot?",
        answer: "No. Capture is local to the computer that is already in the call.",
      },
    ],
    related: [
      {
        label: "Meetings use case",
        href: "/use-cases/meetings",
        description: "The before and after.",
      },
      {
        label: "What stays on device",
        href: "/guides/what-stays-on-device",
        description: "Audio, vault, and what syncs.",
      },
    ],
  },
  {
    kind: "feature",
    slug: "live-notes",
    path: "/features/live-notes",
    eyebrow: "Live notes",
    title: "A note that updates itself, on a schedule you wrote down.",
    description:
      "A live: frontmatter block turns a Markdown note into a self-updating artifact — one objective, optional cron, windows, or event triggers.",
    lede: "Most notes die the afternoon they are written. A live note has a job: keep this page true. The desktop app wakes it on a 15-second tick and rewrites it from the sources you named.",
    screenshot: screenshot.knowledge,
    screenshotAlt: "Local knowledge and live notes in Oppulence Desktop",
    problem: {
      title: "The account brief is stale by Thursday.",
      body: "You wrote a prep note on Monday. Two emails and a Slack thread landed since. The meeting is in an hour. Nobody reopened the note.",
    },
    howItWorks: {
      title: "One frontmatter block. One objective.",
      body: "Add a live: block to a Markdown file in the vault. Name the objective. Optionally add a cron, a time window, or event-match criteria. The runner does a pass to decide whether to fire, then a pass to rewrite the note.",
    },
    workflow: [
      "Create a normal Markdown note in the local vault.",
      "Add a live: block with one objective and, if you want, a schedule or event match.",
      "The desktop scheduler ticks every 15 seconds and runs notes that are due.",
      "The rewritten note is still a file you can open in any editor.",
    ],
    capabilities: [
      {
        title: "Cron, windows, events",
        body: "A note can wake on a clock, inside a time window, or when something matching its criteria happens.",
      },
      {
        title: "Still just Markdown",
        body: "The vault is files. You can read them without Oppulence. Live is an overlay, not a lock-in format.",
      },
      {
        title: "Used by the copilot",
        body: "A live note is a skill the assistant can see. Future briefs start from a page that has been kept.",
      },
    ],
    examples: [
      {
        title: "The weekly account brief",
        body: "A note whose job is 'keep this account current from mail and meetings' and whose cron is Sunday night.",
      },
    ],
    integrations: [{ label: "Local vault", href: "/features/local-vault" }],
    security:
      "Live notes run on the desktop against the vault you chose. They do not publish themselves to the web app.",
    faqs: [
      {
        question: "Does a live note run in the cloud?",
        answer:
          "The scheduler is a desktop process. Cloud background tasks are a different system, used for signed-in relationship runs.",
      },
    ],
    related: [
      { label: "Local vault", href: "/features/local-vault", description: "Where the file lives." },
      { label: "Agents", href: "/features/agents", description: "The runner next to the note." },
    ],
  },
  {
    kind: "feature",
    slug: "local-vault",
    path: "/features/local-vault",
    eyebrow: "Local vault",
    title: "Plain Markdown. Your directory. Your editor if you want it.",
    description:
      "Oppulence Desktop keeps an Obsidian-compatible Markdown vault for notes, meeting output, and synced traces you choose to pull in.",
    lede: "Your notes live in a folder you choose. Inspect, edit, and back them up as Markdown. A private note records your perspective; it must remain distinct from customer statements and shared evidence.",
    screenshot: screenshot.knowledge,
    screenshotAlt: "Local Markdown knowledge in Oppulence Desktop",
    problem: {
      title: "The useful note is the one you can still open in five years.",
      body: "SaaS notes disappear with the subscription. A vault of Markdown files does not. That matters when the note is how you remember a customer.",
    },
    howItWorks: {
      title: "A folder, a watcher, a graph.",
      body: "Point the desktop app at a workspace directory. It watches for changes. Gmail, Granola, and Fireflies can write Markdown into it. On-device embeddings make the folder searchable.",
    },
    workflow: [
      "Choose a directory on first run, or later in settings.",
      "Write notes as Markdown. Use live: frontmatter if the page should refresh.",
      "Optionally sync Gmail, Granola, or Fireflies into the same tree.",
      "Search locally. Sync evidence to the ledger only when you are signed in and want that.",
    ],
    capabilities: [
      {
        title: "Obsidian-compatible files",
        body: "You can open the same folder in another editor. Oppulence is not the only reader.",
      },
      {
        title: "On-device embeddings",
        body: "Release builds bundle a semantic index so search does not require a round trip.",
      },
      {
        title: "Selective sync",
        body: "Local knowledge can stay local. The evidence outbox is how signed-in desktops offer meeting and mail traces to the API.",
      },
    ],
    examples: [
      {
        title: "The account you cannot lose",
        body: "A long customer lives in a folder of notes, meeting files, and a live brief. That folder is still there if you cancel the cloud plan.",
      },
    ],
    integrations: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "MCP", href: "/integrations/mcp" },
    ],
    security:
      "The vault is user-inspectable and deletable. Config lives under ~/.rowboat/. Deleting the folder deletes the notes. Cloud sync is a separate, signed-in path.",
    faqs: [
      {
        question: "Do I have to use the cloud ledger to keep a vault?",
        answer:
          "No. First-run onboarding lets you sign in or bring your own model keys and stay local.",
      },
    ],
    related: [
      { label: "Live notes", href: "/features/live-notes", description: "Notes that refresh." },
      { label: "Desktop", href: "/desktop", description: "The app that owns the folder." },
      {
        label: "What stays on device",
        href: "/guides/what-stays-on-device",
        description: "Vault vs ledger.",
      },
    ],
  },
  {
    kind: "feature",
    slug: "agents",
    path: "/features/agents",
    eyebrow: "Agents and workflows",
    title: "A copilot with tools, and jobs that run when you are not looking.",
    description:
      "Desktop ships a chat agent with MCP and builtin tools. Web has agent definitions and a workflows surface. Cloud jobs can run on Temporal when you pick the API target.",
    lede: "The assistant is useful because it can see the vault, the browser, and the ledger — and because a background job can keep watching after you close the lid.",
    screenshot: screenshot.chat,
    screenshotAlt: "Oppulence Desktop conversational view over account history",
    problem: {
      title: "Chat without tools is a drafting window.",
      body: "If the assistant cannot read the note, the thread, or the calendar, it will invent a confident paragraph. The useful version has tools and a place to put the result.",
    },
    howItWorks: {
      title: "Interactive on the desktop. Scheduled on either side.",
      body: "Copilot chat is the default desktop agent. Pre-built meeting-prep and email-draft agents are opt-in. Background tasks declare an execution target: desktop or api. The API path uses Temporal.",
    },
    workflow: [
      "Ask the desktop copilot about an account, a file, or a page in the in-app browser.",
      "Attach MCP servers you already run, or use builtin mail, file, and browser tools.",
      "Schedule a job if the work should repeat. Pick desktop or API as the target.",
      "Review runs on the workflows surface. Approval still applies to external writes.",
    ],
    capabilities: [
      {
        title: "MCP, not a private plugin format",
        body: "Servers are configured in ~/.rowboat/config/mcp.json. The same protocol the rest of the toolchain already uses.",
      },
      {
        title: "In-app browser",
        body: "Desktop can read a page and match skills to a URL. That is a local capability, not a hosted crawler.",
      },
      {
        title: "Web agents and workflows",
        body: "The signed-in web app has an agents page and a workflows page for definitions and runs you want in the cloud.",
      },
    ],
    examples: [
      {
        title: "Meeting prep on an interval",
        body: "An opt-in pre-built agent that rebuilds the brief before the next call, from the account rather than a template.",
      },
    ],
    integrations: [{ label: "MCP", href: "/integrations/mcp" }],
    security:
      "Tool calls that touch external systems still go through the same approval boundary when they would send or write. MCP servers you add are your process, running as you configured them.",
    faqs: [
      {
        question: "Is this the older Rowboat agent builder?",
        answer:
          "No. The self-hosted visual agent-builder in the legacy rowboat app is a different codebase. This page describes the desktop copilot, MCP, and the web agents/workflows surfaces.",
      },
    ],
    related: [
      {
        label: "Governed actions",
        href: "/features/governed-actions",
        description: "Writes still wait.",
      },
      { label: "MCP", href: "/integrations/mcp", description: "Bring your own tools." },
    ],
  },
];

export const useCasePages: CapabilityPage[] = [
  {
    kind: "use-case",
    slug: "founder-operator",
    path: "/use-cases/founder-operator",
    eyebrow: "Founder-operator",
    title: "The sent folder is not a pipeline.",
    description:
      "For founders who still make the promises themselves: recover what was offered, what went quiet, and what is still owed.",
    lede: "You remember the deals you are thinking about. You do not remember the verbal yes from six weeks ago. The register is for the second category.",
    screenshot: screenshot.email,
    screenshotAlt: "Oppulence Desktop showing customer threads flagged beside the assistant",
    problem: {
      title: "Before: reconstruct the week from memory.",
      body: "Sunday night you scroll Gmail, glance at the CRM, and guess who you owe a reply. The expensive misses are the ones that did not email you back.",
    },
    howItWorks: {
      title: "After: a short list with sources.",
      body: "Connect Gmail. Optionally add calendar and HubSpot. The queue names the relationships where a promise is open and the thread went quiet, with the amount if one was said.",
    },
    workflow: [
      "Connect Gmail in a few minutes. Access starts read-only.",
      "Let the first pass read the recent window.",
      "Work the queue. Approve a follow-up or mark the row as dropped.",
      "Keep using mail as you do now. The ledger updates behind it.",
    ],
    capabilities: [
      {
        title: "Watch is free",
        body: "The published plans start with a 6-month report. Upgrade when the live register becomes a weekly habit, not before.",
      },
    ],
    examples: [
      {
        title: "The proposal that died in August",
        body: "Still a real number. Still a person who said they would reply after vacation. Still nobody's job except yours.",
      },
    ],
    integrations: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "Attention queue", href: "/features/attention-queue" },
    ],
    faqs: [
      {
        question: "Do I need a team seat model?",
        answer:
          "Published pricing is flat monthly, not a seat tax. If that ever changes, it will change on the pricing page, not in a footnote.",
      },
    ],
    related: [
      { label: "Pricing", href: "/pricing", description: "Watch, Chase, Intelligence." },
      { label: "Download", href: "/download", description: "If you want it next to the inbox." },
    ],
  },
  {
    kind: "use-case",
    slug: "account-management",
    path: "/use-cases/account-management",
    eyebrow: "Account management",
    title: "Renewals and handovers should not start from folklore.",
    description: "For AEs, CS, and delivery leads who inherit promises they did not make.",
    lede: "The person who closed the deal is not always the person who has to keep it. Mission control is how the history survives the handoff.",
    screenshot: screenshot.webList,
    screenshotAlt: "A ranked book of accounts with health and next actions",
    problem: {
      title: "Before: a CRM stage and a Slack ask.",
      body: "You get an account two weeks before renewal. The CRM says healthy. The customer remembers three things you cannot find.",
    },
    howItWorks: {
      title: "After: objections, dates, and who cares.",
      body: "Open the account. Read the open commitments in both directions. See who went quiet. The recommended next move is a draft you can reject.",
    },
    workflow: [
      "Filter the book to your patch or the team queue.",
      "Open the accounts that moved, not the ones that merely emailed.",
      "Check the source before you promise anything new.",
      "Leave the outcome on the record so the next owner does not repeat the week.",
    ],
    capabilities: [
      {
        title: "Shared web queue",
        body: "Web is the surface for a team looking at the same book. Desktop is for the person doing the work all day.",
      },
    ],
    examples: [
      {
        title: "QBR in nine days",
        body: "The account view is the brief: what you last promised, what they pushed back on, what slipped since the last review.",
      },
    ],
    integrations: [
      { label: "HubSpot", href: "/integrations/hubspot" },
      { label: "Account mission control", href: "/features/account-mission-control" },
    ],
    faqs: [
      {
        question: "Will this write into HubSpot by itself?",
        answer: "Not without approval. A CRM note or task is a proposed action.",
      },
    ],
    related: [
      {
        label: "Account mission control",
        href: "/features/account-mission-control",
        description: "The view.",
      },
      { label: "Web", href: "/web", description: "The shared surface." },
    ],
  },
  {
    kind: "use-case",
    slug: "meetings",
    path: "/use-cases/meetings",
    eyebrow: "Meetings",
    title: "Walk in knowing the last promise. Walk out with the next one written down.",
    description:
      "Prep from the account, capture the call on the machine, and keep the agreement on the ledger.",
    lede: "The meeting is where dates get said out loud and then lost. Oppulence treats that as a capture problem and a memory problem, not a transcription product.",
    screenshot: screenshot.meetings,
    screenshotAlt: "Meeting notes and capture in Oppulence Desktop",
    problem: {
      title: "Before: a calendar block and a blank page.",
      body: "You open the invite, skim the last email, and hope you remember the concession from last month. Afterwards you mean to write a note.",
    },
    howItWorks: {
      title: "After: a brief, a local recording, a row.",
      body: "Desktop can brief you from the account. Capture records the room without a bot. Live notes can refresh the page. Signed-in evidence can land on the register.",
    },
    workflow: [
      "Open the account before the call.",
      "Start local capture if you want the audio.",
      "After the call, keep the dates that were actually agreed.",
      "Approve any follow-up instead of trusting that you will write it later.",
    ],
    capabilities: [
      {
        title: "Local first",
        body: "Audio and transcripts can stay on disk. That is the point of the desktop path.",
      },
    ],
    examples: [
      {
        title: "The date that slipped across three calls",
        body: "Nobody decided it slipped. The register is how you notice that before the customer does.",
      },
    ],
    integrations: [
      { label: "Meeting capture", href: "/features/meeting-capture" },
      { label: "Calendar", href: "/integrations/calendar" },
    ],
    faqs: [
      {
        question: "Can I keep using Granola or Fireflies?",
        answer:
          "Yes. Desktop can pull those notes into the vault. Oppulence is not asking you to replace a recorder you already like.",
      },
    ],
    related: [
      {
        label: "Meeting capture",
        href: "/features/meeting-capture",
        description: "How audio is handled.",
      },
      {
        label: "Voice",
        href: "/voice-app",
        description: "Dictation and meeting notes as a separate app.",
      },
    ],
  },
  {
    kind: "use-case",
    slug: "research",
    path: "/use-cases/research",
    eyebrow: "Research and verification",
    title: "Confirm the person before you spend the follow-up.",
    description:
      "Check role, contactability, and the last real interaction before a draft goes anywhere near send.",
    lede: "A good next move sent to the wrong person is just another bounce. Verification is a step, not a vibe.",
    screenshot: screenshot.connections,
    screenshotAlt: "Connected sources and contact context in Oppulence",
    problem: {
      title: "Before: the CRM title is a year old.",
      body: "You write a careful note to a champion who left in June. The bounce teaches you for free, and costs you the week.",
    },
    howItWorks: {
      title: "After: the contact is part of the gate.",
      body: "Governed actions check suppression, role changes, and whether the person is still on the thread. Research in the vault and the in-app browser can sit next to that check.",
    },
    workflow: [
      "Open the account and read who is actually on recent threads.",
      "Use desktop search or the in-app browser if you need a public page.",
      "Let the approval gate refuse a bad address.",
      "Only then send.",
    ],
    capabilities: [
      {
        title: "Source before story",
        body: "If Oppulence cannot cite the role change, it should not invent one. Missing data is labelled.",
      },
    ],
    examples: [
      {
        title: "The champion who changed jobs",
        body: "The thread went quiet because the person left. The queue should say that, not 'follow up on the proposal'.",
      },
    ],
    integrations: [
      { label: "Governed actions", href: "/features/governed-actions" },
      { label: "Agents", href: "/features/agents" },
    ],
    faqs: [
      {
        question: "Do you sell a data-enrichment firehose?",
        answer:
          "No. Verification here means checking the sources you already connected, plus research you run on the desktop. We will not invent a contact graph we do not have.",
      },
    ],
    related: [
      {
        label: "Governed actions",
        href: "/features/governed-actions",
        description: "The gate that uses this.",
      },
    ],
  },
];

export const integrationPages: CapabilityPage[] = [
  {
    kind: "integration",
    slug: "gmail",
    path: "/integrations/gmail",
    eyebrow: "Gmail",
    title: "Start with the conversations you already have.",
    description:
      "Connect Gmail so the assistant can use authorized conversations as context and prepare replies for your review.",
    lede: "Start with Gmail and keep working in your familiar email app if you prefer. Add meetings, notes, and other sources when they help explain the conversation.",
    screenshot: screenshot.email,
    screenshotAlt: "Customer threads in Oppulence Desktop next to the assistant",
    problem: {
      title: "The answer is often in an earlier thread.",
      body: "An open question, a decision, or a useful introduction may be buried in earlier correspondence. Bring that history into view before preparing the next reply.",
    },
    howItWorks: {
      title: "OAuth, a recent window, a draft you can refuse.",
      body: "Google OAuth starts the Gmail and Calendar connection. Reads cover email threads, meetings, and commitments. Writes are gmail_draft and gmail_send, and they wait.",
    },
    workflow: [
      "Start Google OAuth from settings.",
      "Grant read access. Write scopes can wait.",
      "Let the first pass read the recent window.",
      "Approve a draft when you actually want it in the mailbox.",
    ],
    capabilities: [
      {
        title: "Read-only to start",
        body: "Begin with source review. Grant write access only when you want to use approved actions.",
      },
      {
        title: "Same Google account as calendar",
        body: "Gmail and Calendar share the Google OAuth start path.",
      },
    ],
    examples: [
      {
        title: "Two minutes, then a 6-month pass",
        body: "That is the Watch plan's job: a first report over recent mail, with source links.",
      },
    ],
    security:
      "Tokens are held by the API OAuth broker, not pasted into the desktop. Web sessions keep tokens in HTTP-only encrypted cookies.",
    faqs: [
      {
        question: "Do you read the whole history of the account?",
        answer: "The current Gmail window is 6 months. That is intentional.",
      },
    ],
    related: [
      {
        label: "Calendar",
        href: "/integrations/calendar",
        description: "The other half of Google.",
      },
      { label: "Security", href: "/security", description: "Where credentials live." },
    ],
  },
  {
    kind: "integration",
    slug: "calendar",
    path: "/integrations/calendar",
    eyebrow: "Google Calendar",
    title: "Meetings are where dates get said. The calendar is the index.",
    description:
      "Google Calendar is read as a relationship source for meetings and the commitments that happen around them.",
    lede: "A QBR on the calendar is not a commitment. It is a place a commitment is likely to be made. Oppulence treats it that way.",
    screenshot: screenshot.meetings,
    screenshotAlt: "Meetings and calendar context in Oppulence Desktop",
    problem: {
      title: "The invite title is not the agreement.",
      body: "You have the meeting. You do not have the date that was spoken in it, unless someone wrote it down.",
    },
    howItWorks: {
      title: "Same Google OAuth as Gmail.",
      body: "Calendar reads meetings into the relationship model. Desktop can brief you from the account before the block. Capture is a separate, local path.",
    },
    workflow: [
      "Connect Google. Calendar comes with Gmail on that path.",
      "Upcoming meetings attach to the account when the people match.",
      "After the meeting, keep the dates that were actually agreed.",
    ],
    capabilities: [
      {
        title: "About 180 days of history",
        body: "The current Calendar window is longer than mail, because a QBR cycle is longer than a thread.",
      },
      {
        title: "Writes are calendar events, after approval",
        body: "A proposed event is still a governed action.",
      },
    ],
    examples: [],
    security: "Calendar access is the Google OAuth grant you see at connect time. Nothing else.",
    faqs: [
      {
        question: "Outlook?",
        answer:
          "Voice mentions Microsoft calendar for that app's own meeting detection. The relationship-intelligence connector set documented here is Google Calendar.",
      },
    ],
    related: [
      { label: "Gmail", href: "/integrations/gmail" },
      { label: "Meetings", href: "/use-cases/meetings" },
    ],
  },
  {
    kind: "integration",
    slug: "slack",
    path: "/integrations/slack",
    eyebrow: "Slack",
    title: "The promise made at 6pm in a channel is still a promise.",
    description:
      "Slack is a relationship source for messages, threads, and decisions. DMs are out of the first beta. Writes are approval-gated.",
    lede: "A lot of dates are granted in public channels and then forgotten. Slack is in the connector set so those sentences can join the register.",
    screenshot: screenshot.desktop,
    screenshotAlt: "Oppulence Desktop working next to the rest of the day",
    problem: {
      title: "Slack search is not a register.",
      body: "You can find the message if you remember the words. You cannot ask 'what did we owe Acme after Thursday'.",
    },
    howItWorks: {
      title: "OAuth to Slack. Public and selected private channels.",
      body: "The first beta reads public channels and private channels you pick. Direct messages are excluded. A Slack message write is a governed action.",
    },
    workflow: [
      "Start Slack OAuth from settings.",
      "Choose the channels that actually hold customer work.",
      "Let the 6-month window land on the register.",
      "Approve a reply if you want Oppulence to draft in Slack.",
    ],
    capabilities: [
      {
        title: "No DMs in the first beta",
        body: "That is a product boundary, not a missing checkbox we forgot to mention.",
      },
    ],
    examples: [],
    security:
      "Desktop also has a separate local Slack path via agent-slack and a local config file. That is not the same as the API OAuth connector.",
    faqs: [
      {
        question: "Will you read my DMs later?",
        answer:
          "Not in the current beta. If that changes, it will be an explicit grant, not a silent expansion.",
      },
    ],
    related: [
      { label: "Governed actions", href: "/features/governed-actions" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    kind: "integration",
    slug: "hubspot",
    path: "/integrations/hubspot",
    eyebrow: "HubSpot",
    title: "Deals and companies, next to what was actually promised.",
    description:
      "HubSpot is the CRM source: companies, contacts, and deals as context. Notes and tasks can be written after approval.",
    lede: "HubSpot already knows the stage. It does not know the sentence that closed the stage. Oppulence keeps those next to each other.",
    screenshot: screenshot.webDetail,
    screenshotAlt: "Account detail with CRM-adjacent evidence in Oppulence",
    problem: {
      title: "A close date is not a delivery date.",
      body: "The deal is won. The implementation promise lives in a thread the CRM never saw.",
    },
    howItWorks: {
      title: "API key connection. About a year of CRM history.",
      body: "HubSpot connects through the connections API-key path. Reads cover companies, contacts, and deals. Writes are crm_note and crm_task, gated.",
    },
    workflow: [
      "Add a HubSpot key in connections.",
      "Let the recent year of CRM objects attach to accounts.",
      "Use the CRM as context, not as the only truth.",
      "Approve a note or task if you want it back in HubSpot.",
    ],
    capabilities: [
      {
        title: "Context, not a takeover",
        body: "Oppulence does not try to become your pipeline. It cites HubSpot the way it cites mail.",
      },
    ],
    examples: [],
    security: "The key is stored by the connector broker, not in the browser.",
    faqs: [
      {
        question: "Salesforce?",
        answer:
          "Not in the first-party relationship connector set. We will not list it as if it were.",
      },
    ],
    related: [
      { label: "Why not a CRM", href: "/compare/crm" },
      { label: "Account management", href: "/use-cases/account-management" },
    ],
  },
  {
    kind: "integration",
    slug: "mcp",
    path: "/integrations/mcp",
    eyebrow: "MCP",
    title: "Bring the tools you already run.",
    description:
      "Oppulence Desktop speaks MCP. Point it at servers in your config and the copilot can use those tools.",
    lede: "We are not going to pretend every tool in the registry is a first-party, production-ready integration. MCP is how you attach the rest.",
    screenshot: screenshot.tasks,
    screenshotAlt: "Background tasks and tool runs in Oppulence Desktop",
    problem: {
      title: "A closed catalog goes stale the week after we publish it.",
      body: "Your stack is not our marketplace. The useful move is a protocol, not a logo wall.",
    },
    howItWorks: {
      title: "A config file, a server, a tool call.",
      body: "MCP servers live in ~/.rowboat/config/mcp.json. The desktop agent runtime can call them. The API also has a managed connector registry — treat money-moving scopes as development-only unless we say otherwise.",
    },
    workflow: [
      "Add a server to the desktop MCP config.",
      "Restart or reload so the copilot can see the tools.",
      "Call them from chat the way you would any other tool.",
      "Keep writes that touch customers behind the same judgment you would use without an agent.",
    ],
    capabilities: [
      {
        title: "Local servers",
        body: "If it runs on your machine and speaks MCP, the desktop app can use it.",
      },
      {
        title: "Managed registry is not a promise of production writes",
        body: "GitHub, Linear, Notion, Stripe, and others appear in the API connector registry. Finance write scopes are environment-limited.",
      },
    ],
    examples: [],
    security:
      "An MCP server you add is your process. Review what it can do before you let an agent call it.",
    faqs: [
      {
        question: "Is Stripe a first-party billing integration?",
        answer:
          "Stripe is how Oppulence itself bills plans. A Stripe MCP connector in the registry is a different thing, and money-moving scopes are not a production claim.",
      },
    ],
    related: [
      { label: "Agents", href: "/features/agents" },
      { label: "Security", href: "/security" },
    ],
  },
];

export const guidePages: CapabilityPage[] = [
  {
    kind: "guide",
    slug: "desktop-vs-web",
    path: "/guides/desktop-vs-web",
    eyebrow: "Guide",
    title: "Choose Web, Desktop, or Voice for the work at hand.",
    description:
      "Start in your browser, add Desktop for local work, and use the optional Voice companion for capture.",
    lede: "Web is the everyday home. Desktop adds local files and native tools. Voice handles global dictation and meeting capture. Shared navigation and the complete Voice handoff are in development.",
    screenshot: screenshot.desktopHome,
    screenshotAlt: "Oppulence Desktop home view",
    problem: {
      title: "Start with the work in front of you.",
      body: "Choose Web for browser access, Desktop for local files and native tools, and Voice for dictation or capture. You can start with one app and add another when you need it.",
    },
    howItWorks: {
      title: "One assistant, distinct roles.",
      body: "Web and Desktop use the shared Oppulence service. Desktop adds your local vault, embedded browser, and native tools. Voice remains independently useful, with a planned connection to the same assistant runtime.",
    },
    workflow: [
      "Start on the web without installing a native application.",
      "Add Desktop when you need local notes, an embedded browser, or native tools.",
      "Add Voice when you want dictation or meeting capture without opening the full workspace.",
      "Check the sharing and provider settings before making local material available to a cloud service.",
    ],
    capabilities: [],
    examples: [],
    faqs: [
      {
        question: "Do I need all three apps?",
        answer:
          "No. Start on the web. Desktop and Voice are optional, separate downloads. The complete shared navigation and Voice-to-relationship handoff are still in development.",
      },
    ],
    related: [
      { label: "Web", href: "/web" },
      { label: "Desktop", href: "/desktop" },
      { label: "Download", href: "/download" },
    ],
  },
  {
    kind: "guide",
    slug: "what-stays-on-device",
    path: "/guides/what-stays-on-device",
    eyebrow: "Guide",
    title: "What stays on the machine, and what does not.",
    description:
      "Understand local notes, meeting audio, shared relationship data, model providers, and analytics.",
    lede: "We will not say 'nothing leaves your computer.' That is only true for some setups. Here is the actual split.",
    screenshot: screenshot.knowledge,
    screenshotAlt: "Local knowledge staying on the desktop",
    problem: {
      title: "Privacy pages that say everything and nothing.",
      body: "If you handle customer calls, you need to know whether the audio file is uploaded. Most assistant sites will not say.",
    },
    howItWorks: {
      title: "Three pipes, on purpose.",
      body: "Local: vault, audio, on-device transcription, local embeddings, BYO model keys. Cloud ledger: signed-in relationship state. Models: your provider or the credit-gated gateway. Analytics: PostHog, fail-closed unless you enable it.",
    },
    workflow: [
      "Decide whether the vault should sync evidence.",
      "Decide whether transcription is local or cloud.",
      "Decide whether you sign in or bring your own keys.",
      "Read the security page if you are evaluating for a team.",
    ],
    capabilities: [],
    examples: [],
    faqs: [
      {
        question: "Can I delete local data?",
        answer:
          "Yes. The vault is a folder. Config is under ~/.rowboat/. Deleting those deletes the local copies we wrote.",
      },
    ],
    related: [
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
  {
    kind: "guide",
    slug: "approval-before-send",
    path: "/guides/approval-before-send",
    eyebrow: "Guide",
    title: "Nothing customer-facing goes out on a guess.",
    description:
      "How proposed Gmail, Slack, calendar, and HubSpot actions are held until a person approves them.",
    lede: "If a product can send as you, the default has to be no. This is the rule Oppulence is built around.",
    screenshot: screenshot.desktopDetail,
    screenshotAlt: "Approve or reject gate on a drafted follow-up",
    problem: {
      title: "Autonomy without a gate is just spam with better copy.",
      body: "The first bad send is the last time a careful team leaves the integration on.",
    },
    howItWorks: {
      title: "A draft is not an action until it is approved.",
      body: "The queue can recommend. The model can write. The connector cannot fire until a person says so. Outcomes teach the next recommendation.",
    },
    workflow: [
      "A next move appears on an account or in the queue.",
      "Read the evidence.",
      "Edit the draft if the wording is yours to fix.",
      "Approve, or do not.",
    ],
    capabilities: [],
    examples: [],
    faqs: [
      {
        question: "Are there actions that skip the gate?",
        answer:
          "Local notes and local search do not need approval. Anything that writes to mail, Slack, calendar, or CRM does.",
      },
    ],
    related: [
      { label: "Governed actions", href: "/features/governed-actions" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    kind: "guide",
    slug: "install-oppulence",
    path: "/guides/install-oppulence",
    eyebrow: "Guide",
    title: "Install the desktop app and get to a useful first hour.",
    description:
      "Supported operating systems, architectures, the download resolver, and the first-run choice between signing in and bringing your own keys.",
    lede: "The site can detect your OS and send you the right installer. You can also pick the file yourself. Both paths hit the same GitHub Releases.",
    screenshot: screenshot.desktopHome,
    screenshotAlt: "Oppulence Desktop after install",
    problem: {
      title: "A download button that guesses wrong is worse than a list.",
      body: "We show a recommended file when we can see the OS, and we still list the rest.",
    },
    howItWorks: {
      title: "GitHub Releases, signed, auto-updated.",
      body: "macOS DMG, Windows EXE, Linux DEB and RPM, arm64 and x64 where we build them. The app updates from the same releases. SBOMs ship with the build.",
    },
    workflow: [
      "Open /download and pick the installer, or let the page recommend one.",
      "On first run, choose Sign in to Oppulence or bring your own model keys.",
      "Optionally connect Google, then Slack or HubSpot.",
      "Optionally point the vault at a folder you already have.",
    ],
    capabilities: [],
    examples: [],
    faqs: [
      {
        question: "Is Linux actually supported?",
        answer:
          "Yes. DEB, RPM, and zip builds ship from the same release workflow as Mac and Windows.",
      },
    ],
    related: [
      { label: "Download", href: "/download" },
      { label: "Desktop", href: "/desktop" },
    ],
  },
];

export const allCapabilityPages = [
  ...featurePages,
  ...useCasePages,
  ...integrationPages,
  ...guidePages,
];

export function getCapabilityPage(kind: CapabilityPage["kind"], slug: string) {
  return allCapabilityPages.find((page) => page.kind === kind && page.slug === slug);
}

export const indexCopy = {
  features: {
    title: "The context and tools behind the assistant.",
    description:
      "Explore relationship memory, follow-ups, source review, approvals, and the native tools that support everyday work.",
  },
  useCases: {
    title: "The jobs people actually run.",
    description:
      "Prepare for meetings, review replies, keep relationships in context, and follow through on unfinished work.",
  },
  integrations: {
    title: "Sources we actually connect.",
    description:
      "Gmail, Google Calendar, Slack, HubSpot, and MCP. If it is not on this list, we will not logo-wash it.",
  },
  guides: {
    title: "Short guides for the decisions that matter.",
    description:
      "Which surface to use, what stays on the machine, why sends wait, and how to install.",
  },
  resources: {
    title: "The rest of the public site, in one place.",
    description:
      "Guides, changelog, security, integrations, and the older blog archive. No fabricated customer wall.",
  },
} as const;
