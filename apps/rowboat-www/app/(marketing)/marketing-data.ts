import { applySeoTheme } from "./seo-theme";

export type LinkItem = {
  label: string;
  href: string;
  description?: string;
  external?: boolean;
};

export type MarketingPage = {
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  category: "feature" | "product" | "tool" | "blog" | "customer" | "legal" | "landing";
  bullets: string[];
  proof: string[];
  ctaLabel?: string;
  ctaHref?: string;
};

export type FeatureDetail = {
  summary: string;
  heroProof?: string[];
  capabilities?: {
    title: string;
    body: string;
  }[];
  sections: {
    title: string;
    body: string;
  }[];
  workflow: string[];
  useCases?: {
    title: string;
    body: string;
  }[];
  outcomes: string[];
  relatedPages?: LinkItem[];
};

export const featureLinks: LinkItem[] = [
  {
    label: "Relationship State Engine",
    href: "/ai-help-center",
    description: "Find missed commitments and warm opportunities in the last 6 months",
  },
  {
    label: "Account Mission Control",
    href: "/ai-documentation-agent",
    description: "See who needs attention, why now, and the recommended next move",
  },
  {
    label: "Research and verification",
    href: "/automated-screenshots-for-docs",
    description: "Confirm account context, current roles, and contactability",
  },
  {
    label: "Policy and sender protection",
    href: "/api-documentation-software",
    description: "Check suppression, frequency, permissions, and sender health",
  },
  {
    label: "Relationship memory",
    href: "/internal-knowledge-base",
    description: "Preserve promises, objections, evidence, and outcomes over time",
  },
  {
    label: "Closed-loop learning",
    href: "/self-updating-help-center",
    description: "Use replies, meetings, edits, and revenue outcomes to improve the next action",
  },
  {
    label: "Connected revenue systems",
    href: "/multilingual-knowledge-base",
    description: "Unify email, calendar, meetings, CRM, research, and execution",
  },
  {
    label: "Meeting intelligence",
    href: "/generative-ai-customer-service",
    description: "Carry the relationship forward before and after every meeting",
  },
  {
    label: "Governed execution",
    href: "/code-to-docs",
    description: "Keep approval and audit boundaries around every material action",
  },
  {
    label: "Source evidence",
    href: "/chrome-extension-for-documentation",
    description: "Keep every recommendation tied to the evidence behind it",
  },
];

export const productLinks: LinkItem[] = [
  {
    label: "Products",
    href: "/products",
    description: "One assistant across Web, Desktop, and Voice",
  },
  {
    label: "Oppulence Web",
    href: "/web",
    description: "Your work, organized in a browser. Nothing to install.",
  },
  {
    label: "Oppulence Desktop",
    href: "/desktop",
    description: "Your full workspace, with local files and native tools",
  },
  {
    label: "Oppulence Voice",
    href: "/voice-app",
    description: "Optional dictation, thought capture, and meeting recording",
  },
  {
    label: "The Oppulence assistant",
    href: "/product",
    description: "Relationships, meetings, email, and follow-through",
  },
  {
    label: "Pricing",
    href: "/pricing",
    description: "Choose the plan for monitored relationships, team access, and governance",
  },
  {
    label: "Account Mission Control",
    href: "/api-documentation-software",
    description: "Prioritize, verify, govern, approve, execute, and learn in one queue",
  },
  {
    label: "Open Oppulence",
    href: "/app",
    description: "Open your browser workspace",
  },
];

export const resourceLinks: LinkItem[] = [
  { label: "Guides", href: "/blog", description: "Revenue memory and governed execution guides" },
  { label: "Customers", href: "/customers", description: "Early operator stories" },
  {
    label: "Relationship memory",
    href: "/self-updating-help-center",
    description: "Why commercial context should compound across every interaction",
  },
  {
    label: "Governed execution",
    href: "/api-documentation-software",
    description: "Approval, policy, action, and outcome workflows",
  },
];

export const toolLinks: LinkItem[] = [
  {
    label: "Tool contract validator",
    href: "/tools/openapi-validator",
    description: "Check action contracts before agents depend on them",
  },
  {
    label: "Context debt quiz",
    href: "/tools/docs-debt-quiz",
    description: "Find where important work still lives outside the graph",
  },
];

export const alternativeLinks: LinkItem[] = [
  { label: "HelpDocs alternatives", href: "/blog/best-helpdocs-alternatives" },
  { label: "Mintlify alternatives", href: "/blog/best-mintlify-alternatives" },
  { label: "Zendesk alternatives", href: "/blog/best-zendesk-help-center-alternatives" },
  { label: "Intercom alternatives", href: "/blog/best-intercom-help-center-alternatives" },
  { label: "Docusaurus alternatives", href: "/blog/best-docusaurus-alternatives" },
  { label: "GitBook alternatives", href: "/blog/best-gitbook-alternatives" },
  { label: "Document360 alternatives", href: "/blog/best-document360-alternatives" },
  { label: "Help Scout alternatives", href: "/blog/best-help-scout-alternatives" },
];

export const socialLinks: LinkItem[] = [
  {
    label: "Discord",
    href: "https://discord.gg/wajrgmJQ6b",
    external: true,
  },
];

const baseProof = [
  "Every recommendation includes a reason and source evidence.",
  "Verification, policy, approval, and execution remain clear boundaries.",
  "Replies, meetings, edits, and revenue outcomes improve future actions.",
];

export const featureDetails: Record<string, FeatureDetail> = {
  "ai-help-center": {
    summary:
      "The Revenue Leak Scan reviews recent communication, meetings, calendar, and CRM history to find valuable commercial relationships that have gone quiet or lost their next step.",
    heroProof: [
      "Scans the previous 6 months of commercial history.",
      "Ranks missed commitments and warm opportunities by value and urgency.",
      "Explains every finding with source evidence.",
    ],
    sections: [
      {
        title: "Recover the missed promise",
        body: "Find follow-ups that were promised, proposals that went unanswered, and conversations that lost their next step.",
      },
      {
        title: "Reopen the warm relationship",
        body: "Surface dormant champions, former customers, neglected referrals, and accounts with a real reason to reconnect now.",
      },
      {
        title: "Show the evidence",
        body: "Keep the email, meeting, calendar event, CRM record, and extracted commitment attached to every recommendation.",
      },
    ],
    workflow: [
      "Connect email, calendar, meetings, and CRM history.",
      "Scan the previous 6 months for commercial open loops.",
      "Rank findings by relationship value, urgency, and confidence.",
      "Move the best findings into the revenue action queue.",
    ],
    useCases: [
      {
        title: "Unanswered proposals",
        body: "Find proposals and commercial asks that never received a clear response or next step.",
      },
      {
        title: "Dormant champions",
        body: "Reconnect when the timing, role, budget cycle, or relationship history creates a credible reason to reach out.",
      },
      {
        title: "Missed commitments",
        body: "Catch promises such as “contact me again in July” before they disappear into old threads and meeting notes.",
      },
    ],
    outcomes: [
      "More warm opportunities recovered before they go cold.",
      "A clear source trail behind every recommended action.",
      "A useful first queue without mass cold outbound.",
    ],
    relatedPages: [
      { label: "Revenue Action Queue", href: "/ai-documentation-agent" },
      { label: "Research and verification", href: "/automated-screenshots-for-docs" },
      { label: "Relationship memory", href: "/internal-knowledge-base" },
    ],
  },
  "ai-documentation-agent": {
    summary:
      "The Revenue Action Queue turns relationship history into a short, ranked list of who needs attention, why now, and the safest recommended next move.",
    heroProof: [
      "Ranked by relationship value, timing, and evidence.",
      "Prior objections and commitments stay visible beside the draft.",
      "Every action can be approved, edited, snoozed, or rejected.",
    ],
    sections: [
      {
        title: "Explain why now",
        body: "Show the promise, opportunity, relationship history, and timing signal that caused an action to enter the queue.",
      },
      {
        title: "Prepare the next move",
        body: "Draft from the evidence, prior objections, account context, and the user’s actual relationship instead of generic personalization.",
      },
      {
        title: "Keep the human boundary",
        body: "Approve, edit, snooze, or reject high-value actions before execution, with the decision retained in the audit trail.",
      },
    ],
    workflow: [
      "Detect a missed commitment or warm opportunity.",
      "Assemble the relationship history and source evidence.",
      "Research, verify, and run policy checks.",
      "Approve, edit, snooze, or reject the proposed action.",
    ],
    useCases: [
      {
        title: "Daily top ten",
        body: "Start with the ten relationships most likely to recover or advance revenue instead of another unranked inbox.",
      },
      {
        title: "Evidence-backed follow-up",
        body: "Prepare a message that reflects what actually happened, what was promised, and why the timing is credible now.",
      },
      {
        title: "Safe review",
        body: "Keep verification, policy status, sender health, and approval state visible before execution.",
      },
    ],
    outcomes: [
      "Less time reconstructing deal context across tools.",
      "More high-value follow-ups completed at the right moment.",
      "A governed path from recommendation to execution and outcome.",
    ],
    relatedPages: [
      { label: "Revenue Leak Scan", href: "/ai-help-center" },
      { label: "Research and verification", href: "/automated-screenshots-for-docs" },
      { label: "Policy and sender protection", href: "/api-documentation-software" },
    ],
  },
  "automated-screenshots-for-docs": {
    summary:
      "Oppulence researches the account, verifies the contact’s current role and address, and keeps the supporting evidence attached before a recommendation becomes an external action.",
    heroProof: [
      "Current account and contact research with source provenance.",
      "Role, address, and contactability verification before drafting.",
      "Verified facts written back into relationship memory.",
    ],
    sections: [
      {
        title: "Research the account",
        body: "Gather current company, role, and commercial context with the source trail preserved for review.",
      },
      {
        title: "Verify the contact",
        body: "Confirm the person’s current role, reachable address, and contactability before the system prepares a message.",
      },
      {
        title: "Preserve the evidence",
        body: "Keep verified facts and sources beside the proposed action and write durable updates back into the relationship memory.",
      },
    ],
    workflow: [
      "Start from a relationship selected by the Revenue Leak Scan.",
      "Research the account and current contact role.",
      "Verify the address and attach evidence to each material claim.",
      "Pass the verified action into policy and approval review.",
    ],
    useCases: [
      {
        title: "Role-change recovery",
        body: "Detect when a former champion moved companies or a contact is no longer in the role stored in the CRM.",
      },
      {
        title: "Dormant-account refresh",
        body: "Bring current account context into an old relationship before deciding whether the timing is credible.",
      },
      {
        title: "Contactability check",
        body: "Avoid wasting an important follow-up on an invalid address, stale role, or unverifiable identity.",
      },
    ],
    outcomes: [
      "Fewer actions prepared for stale or incorrect contacts.",
      "More credible follow-ups backed by current account context.",
      "A durable evidence trail for every verified fact.",
    ],
    relatedPages: [
      { label: "Revenue Leak Scan", href: "/ai-help-center" },
      { label: "Revenue Action Queue", href: "/ai-documentation-agent" },
      { label: "Policy and sender protection", href: "/api-documentation-software" },
    ],
  },
  "self-service-help-widget": {
    summary:
      "The Oppulence widget exposes a graph-backed agent inside a product, portal, or internal tool. It uses configured projects, sources, workflows, and tool boundaries instead of a separate support bot memory.",
    heroProof: [
      "Embed a conversation surface backed by the same project graph.",
      "Route answers and escalations through configured workflows.",
      "Keep action boundaries consistent with the rest of the platform.",
    ],
    sections: [
      {
        title: "Embedded graph access",
        body: "Customers or teammates can ask questions from inside the product while the answer path stays tied to the configured graph.",
      },
      {
        title: "Project-aware routing",
        body: "Sessions can route to the right project, workflow, and source set so answers match the domain instead of a generic assistant.",
      },
      {
        title: "Escalation-ready",
        body: "When an answer is not enough, the same workflow can propose a handoff, draft, ticket, or tool call with review boundaries intact.",
      },
    ],
    workflow: [
      "Create a project with sources, workflows, and tools.",
      "Embed the widget script or iframe in the target surface.",
      "Bootstrap sessions against the widget API.",
      "Route conversations to the right workflow and escalation path.",
    ],
    useCases: [
      {
        title: "In-product help",
        body: "Answer product questions from a graph that can include docs, support context, and known workflows.",
      },
      {
        title: "Internal tools",
        body: "Give operators a focused agent inside the system where they already do the work.",
      },
      {
        title: "Assisted resolution",
        body: "Move from answer to proposed next step when the workflow requires action.",
      },
    ],
    outcomes: [
      "A faster path to product-embedded AI support.",
      "Consistent answers across product and internal operator tools.",
      "Room to grow from Q&A into controlled action workflows.",
    ],
    relatedPages: [
      { label: "Runtime and API", href: "/api-documentation-software" },
      { label: "Customer operations", href: "/generative-ai-customer-service" },
      { label: "Workflow design", href: "/code-to-docs" },
    ],
  },
  "code-to-docs": {
    summary:
      "Oppulence turns technical context into reviewable workflows. Specs, prompts, roles, tool contracts, MCP servers, webhook actions, and simulations become part of the agent system instead of living in disconnected docs.",
    heroProof: [
      "Model roles, handoffs, sources, and tools in one place.",
      "Use contracts before agents call external systems.",
      "Test workflows before exposing them through APIs, widgets, or jobs.",
    ],
    sections: [
      {
        title: "Workflow modeling",
        body: "Define agent responsibilities, handoffs, prompts, tools, and test cases as an operational flow instead of a pile of prompts.",
      },
      {
        title: "Tool contracts",
        body: "MCP servers, webhooks, and API-backed actions can be attached only where inputs, outputs, and failure behavior are explicit enough to review.",
      },
      {
        title: "Simulation before launch",
        body: "Role-played runs help validate behavior before a workflow is exposed through the widget, API, or background execution.",
      },
    ],
    workflow: [
      "Describe the workflow and agent boundaries.",
      "Attach tools, schemas, and source collections.",
      "Run simulated conversations or task scenarios.",
      "Deploy to API, widget, or background execution once the behavior is stable.",
    ],
    useCases: [
      {
        title: "Support workflows",
        body: "Model answer, escalation, and follow-up paths before exposing a customer-facing surface.",
      },
      {
        title: "Ops automation",
        body: "Connect recurring work to tools while keeping review policy explicit.",
      },
      {
        title: "Internal agent systems",
        body: "Reuse the same workflow through desktop, API, widget, or scheduled execution.",
      },
    ],
    outcomes: [
      "Less custom glue code for every new agent.",
      "Clearer review of tool behavior before production use.",
      "Reusable workflows across support, operations, and internal automation.",
    ],
    relatedPages: [
      { label: "Tool contract validator", href: "/tools/openapi-validator" },
      { label: "Runtime and API", href: "/api-documentation-software" },
      { label: "Embedded agents", href: "/self-service-help-widget" },
    ],
  },
  "api-documentation-software": {
    summary:
      "Oppulence exposes the living work graph through a platform runtime: projects, workflows, RAG, widget sessions, workers, and APIs run together for teams that need owned infrastructure instead of a closed assistant.",
    heroProof: [
      "Self-host projects, sources, workflows, and widget sessions.",
      "Run ingestion and jobs outside the request lifecycle.",
      "Keep provider keys, storage, and runtime boundaries under deployment control.",
    ],
    sections: [
      {
        title: "Project and workflow APIs",
        body: "Teams can manage projects, sources, workflows, conversations, test runs, and widget sessions without coupling every integration to the desktop app.",
      },
      {
        title: "Async worker model",
        body: "Ingestion and long-running jobs run outside the request lifecycle, with Mongo, Redis, and Qdrant supporting state, queues, and vector search.",
      },
      {
        title: "Self-hosted control",
        body: "The deployment model is built for teams that need control over data residency, provider keys, runtime configuration, and integration boundaries.",
      },
    ],
    workflow: [
      "Deploy the platform stack with storage, queues, and vector search.",
      "Create projects and configure sources.",
      "Define workflows and tool boundaries.",
      "Expose agents through the public API, widget, or scheduled jobs.",
    ],
    useCases: [
      {
        title: "Embedded agents",
        body: "Expose graph-backed conversations inside products and internal portals.",
      },
      {
        title: "Background workflows",
        body: "Run scheduled or event-triggered jobs that update context or propose actions.",
      },
      {
        title: "Controlled deployment",
        body: "Match stricter environments with owned storage, queues, vector search, and provider configuration.",
      },
    ],
    outcomes: [
      "A complete starting point for owned agent infrastructure.",
      "Clear separation between request handling and long-running work.",
      "A deployment posture that can match stricter customer environments.",
    ],
    relatedPages: [
      { label: "Workflow design", href: "/code-to-docs" },
      { label: "Embedded agents", href: "/self-service-help-widget" },
      { label: "Source federation", href: "/multilingual-knowledge-base" },
    ],
  },
  "multilingual-knowledge-base": {
    summary:
      "Oppulence is designed for source federation: communication, documents, meetings, local files, and tool events can become one work graph even when they start in different systems.",
    heroProof: [
      "Unify communication, meetings, files, and tool events.",
      "Keep source links available for review.",
      "Let agents synthesize across tools without copy-paste.",
    ],
    sections: [
      {
        title: "Source-normalized context",
        body: "The graph abstracts over where a fact came from while preserving the original reference for inspection.",
      },
      {
        title: "Cross-tool continuity",
        body: "A project can span Gmail, Calendar, Fireflies, Slack, GitHub, Linear, web search, and custom MCP servers without manual context transfer.",
      },
      {
        title: "Model flexibility",
        body: "Teams can bring hosted or local models and still keep the graph as the stable context layer above provider-specific capabilities.",
      },
    ],
    workflow: [
      "Connect each source system with clear scope.",
      "Map events and documents into the owned graph.",
      "Keep original references attached for review.",
      "Use agents to synthesize across source boundaries.",
    ],
    useCases: [
      {
        title: "Relationship context",
        body: "Connect emails, meetings, and notes around a person or account.",
      },
      {
        title: "Engineering context",
        body: "Bring GitHub, Linear, docs, and discussions into one project memory.",
      },
      {
        title: "Research context",
        body: "Combine captured web material with internal history before agents summarize or act.",
      },
    ],
    outcomes: [
      "Less siloed memory across teams and tools.",
      "Better context for cross-functional workflows.",
      "A more portable knowledge layer than vendor-specific AI memory.",
    ],
    relatedPages: [
      { label: "Governed execution", href: "/api-documentation-software" },
      { label: "Research capture", href: "/chrome-extension-for-documentation" },
      { label: "Living work graph", href: "/ai-help-center" },
    ],
  },
  "internal-knowledge-base": {
    summary:
      "Oppulence internal memory is private, editable, and operational. It is built for teams that need a graph agents can update and inspect, not another static page library.",
    heroProof: [
      "Store operational context in readable notes.",
      "Make relationships explicit across people, projects, and decisions.",
      "Let workflows refresh notes when facts change.",
    ],
    sections: [
      {
        title: "Private operational memory",
        body: "Internal context can live in plain Markdown so operators can read, edit, and version the knowledge that agents depend on.",
      },
      {
        title: "Entity-based organization",
        body: "Backlinks make relationships explicit across people, accounts, projects, decisions, incidents, and policies.",
      },
      {
        title: "Agent-maintained notes",
        body: "Scheduled and event-triggered workflows can refresh internal notes as facts change, reducing stale runbooks and abandoned docs.",
      },
    ],
    workflow: [
      "Choose the internal domain or team memory to model.",
      "Seed the graph from source documents and communication history.",
      "Create live notes for high-change workflows.",
      "Review updates and correct the corpus directly.",
    ],
    useCases: [
      {
        title: "Team runbooks",
        body: "Keep procedures tied to the decisions, owners, and systems behind them.",
      },
      {
        title: "Account memory",
        body: "Preserve customer context across operators without hiding it in private chats.",
      },
      {
        title: "Incident context",
        body: "Attach people, systems, decisions, and open follow-ups to the same graph.",
      },
    ],
    outcomes: [
      "Internal knowledge that stays closer to the actual work.",
      "A safer way for agents to rely on team-specific context.",
      "Fewer hidden assumptions trapped in chat transcripts or private inboxes.",
    ],
    relatedPages: [
      { label: "Living work graph", href: "/ai-help-center" },
      { label: "Live notes", href: "/automated-screenshots-for-docs" },
      { label: "Source federation", href: "/multilingual-knowledge-base" },
    ],
  },
  "generative-ai-customer-service": {
    summary:
      "Oppulence customer-facing agents can answer from relationship history, product context, support knowledge, and controlled action paths instead of only static help docs.",
    heroProof: [
      "Use customer and product history before answering.",
      "Escalate into drafts, tickets, or handoffs when needed.",
      "Keep sensitive actions inside review boundaries.",
    ],
    sections: [
      {
        title: "Relationship-aware responses",
        body: "Agents can account for prior conversations, open commitments, account-specific notes, and recent meetings before drafting an answer.",
      },
      {
        title: "Operational escalation",
        body: "When a workflow needs more than an answer, agents can propose tickets, messages, updates, or handoffs through configured tools.",
      },
      {
        title: "Human review boundaries",
        body: "Sensitive actions remain gated so teams can choose which steps are automatic, assisted, or manual.",
      },
    ],
    workflow: [
      "Connect the product, support, and relationship sources that matter.",
      "Define the customer-service workflow and fallback policy.",
      "Expose the workflow through the widget or operator dashboard.",
      "Review suggested actions before they touch external systems.",
    ],
    useCases: [
      {
        title: "Support answers",
        body: "Answer from product and customer context without losing the relationship history.",
      },
      {
        title: "Success follow-up",
        body: "Draft the next message or task using commitments from prior conversations.",
      },
      {
        title: "Operational escalation",
        body: "Propose a ticket, handoff, or tool call when the answer is not enough.",
      },
    ],
    outcomes: [
      "More grounded customer answers.",
      "Less context switching for support and success teams.",
      "A path from assistance to safe operational automation.",
    ],
    relatedPages: [
      { label: "Embedded agents", href: "/self-service-help-widget" },
      { label: "Support memory", href: "/help-center-software" },
      { label: "Workflow design", href: "/code-to-docs" },
    ],
  },
  "chrome-extension-for-documentation": {
    summary:
      "Oppulence browser context capture helps users bring useful web material into the graph without losing where it came from or why it mattered.",
    heroProof: [
      "Capture research while it is still fresh.",
      "Attach web context to people, projects, accounts, or topics.",
      "Keep provenance visible for later synthesis.",
    ],
    sections: [
      {
        title: "Capture in flow",
        body: "Operators can pull relevant web context into the corpus while researching competitors, customers, vendors, market changes, or technical references.",
      },
      {
        title: "Provenance-first memory",
        body: "Captured context should remain tied to the original page or search result so later agents can distinguish source material from synthesis.",
      },
      {
        title: "Live research notes",
        body: "Captured web context can seed live notes that continue tracking a topic through scheduled refreshes or search-backed workflows.",
      },
    ],
    workflow: [
      "Capture a page, search result, or excerpt into the relevant note.",
      "Attach it to a person, project, account, or topic.",
      "Let agents synthesize across captured context and existing memory.",
      "Refresh live research notes when the topic changes.",
    ],
    useCases: [
      {
        title: "Competitive research",
        body: "Attach web findings to a topic note that can keep tracking the market.",
      },
      {
        title: "Customer research",
        body: "Save company or account context before a meeting, follow-up, or support workflow.",
      },
      {
        title: "Technical references",
        body: "Bring relevant docs or examples into the graph with their source trail intact.",
      },
    ],
    outcomes: [
      "Research that becomes reusable operational memory.",
      "Less source ambiguity in generated summaries.",
      "A smoother path from web discovery to agent action.",
    ],
    relatedPages: [
      { label: "Live notes", href: "/automated-screenshots-for-docs" },
      { label: "Source federation", href: "/multilingual-knowledge-base" },
      { label: "Living work graph", href: "/ai-help-center" },
    ],
  },
  "ai-faq-generator": {
    summary:
      "Oppulence turns repeated answers into living operational artifacts. A recurring explanation can become a source-linked note, a runbook, or a live workflow that keeps improving.",
    heroProof: [
      "Promote repeated answers into graph notes.",
      "Keep generated artifacts editable and source-linked.",
      "Refresh high-change answers through live notes.",
    ],
    sections: [
      {
        title: "From answer to artifact",
        body: "Instead of leaving repeated explanations in chat history, agents can promote them into editable notes with enough context for the next operator.",
      },
      {
        title: "Runbooks with sources",
        body: "Generated runbooks can include the people, decisions, systems, and source references behind the answer so they remain useful under pressure.",
      },
      {
        title: "Refreshable knowledge",
        body: "High-change answers can become live notes that refresh when the underlying project, account, or policy changes.",
      },
    ],
    workflow: [
      "Identify recurring questions in conversations or support work.",
      "Generate a source-linked note or runbook.",
      "Assign refresh criteria where the answer changes often.",
      "Let agents reuse the artifact in future workflows.",
    ],
    useCases: [
      {
        title: "Support runbooks",
        body: "Turn repeated support explanations into source-linked internal artifacts.",
      },
      {
        title: "Team FAQs",
        body: "Move recurring internal questions out of chat history and into maintained memory.",
      },
      {
        title: "Policy answers",
        body: "Refresh answers when the underlying project, customer, or policy context changes.",
      },
    ],
    outcomes: [
      "Less duplicate explanation work.",
      "Reusable answers that remain inspectable.",
      "A bridge from Q&A to maintained operational memory.",
    ],
    relatedPages: [
      { label: "Team memory", href: "/internal-knowledge-base" },
      { label: "Compounding memory", href: "/self-updating-help-center" },
      { label: "Support memory", href: "/help-center-software" },
    ],
  },
  "help-center-software": {
    summary:
      "Oppulence reframes help-center software as graph-backed operations infrastructure. The published answer is one output of a living graph that can also brief operators, power widgets, and trigger workflows.",
    heroProof: [
      "Start from the graph, not the article surface.",
      "Use the same memory for customer and operator workflows.",
      "Move from answer to next action when the process requires it.",
    ],
    sections: [
      {
        title: "Beyond static publishing",
        body: "A static help center answers known questions. The graph can also capture relationship history, internal process state, and action context.",
      },
      {
        title: "Operator plus customer surfaces",
        body: "The same source graph can support an embedded customer widget, an internal operator dashboard, and background agent workflows.",
      },
      {
        title: "Action-aware support",
        body: "When a support answer implies a follow-up, the platform can draft, route, or propose the next action instead of ending at a link.",
      },
    ],
    workflow: [
      "Model the living work graph before designing the public article surface.",
      "Connect support sources, product docs, and internal runbooks.",
      "Expose customer-facing and operator-facing views.",
      "Add tool actions once policies and review boundaries are clear.",
    ],
    useCases: [
      {
        title: "Self-service support",
        body: "Answer customer questions from a graph that can include docs and operational context.",
      },
      {
        title: "Operator assist",
        body: "Help support teams understand the customer, issue, and next step in one place.",
      },
      {
        title: "Workflow handoff",
        body: "Draft or route the follow-up instead of ending at a static answer.",
      },
    ],
    outcomes: [
      "Answers that improve as the operating graph improves.",
      "Less duplication between customer docs and internal runbooks.",
      "A path from self-service to assisted resolution.",
    ],
    relatedPages: [
      { label: "Embedded agents", href: "/self-service-help-widget" },
      { label: "Customer operations", href: "/generative-ai-customer-service" },
      { label: "Runtime and API", href: "/api-documentation-software" },
    ],
  },
  "self-updating-help-center": {
    summary:
      "Oppulence memory compounds because important notes can update between user sessions. That makes the graph useful for long-running relationships, projects, and operational risks.",
    heroProof: [
      "Track subjects that matter longer than one chat.",
      "Refresh notes from schedules and source changes.",
      "Give future agents fresher context before they start.",
    ],
    sections: [
      {
        title: "Long-lived subjects",
        body: "People, accounts, projects, competitors, incidents, and policies can remain first-class subjects that accumulate context over time.",
      },
      {
        title: "Trigger-driven freshness",
        body: "Scheduled refreshes and matching events keep notes current without relying on someone to remember a manual update.",
      },
      {
        title: "Agent-ready state",
        body: "Fresh notes give agents a stronger starting point for briefs, recommendations, and proposed actions.",
      },
    ],
    workflow: [
      "Pick the subject that needs persistent awareness.",
      "Define what the note should track and when it should refresh.",
      "Let the agent update the note from the source graph.",
      "Use the refreshed state in future workflows.",
    ],
    useCases: [
      {
        title: "Relationship tracking",
        body: "Keep the state of a person, account, or deal current as new work happens.",
      },
      {
        title: "Project memory",
        body: "Refresh owners, decisions, risks, and open questions as a project evolves.",
      },
      {
        title: "Operational watchlists",
        body: "Track topics or risks without remembering to ask for another summary.",
      },
    ],
    outcomes: [
      "Less stale context around high-value work.",
      "A graph that improves between user sessions.",
      "Better long-horizon agent performance.",
    ],
    relatedPages: [
      { label: "Live notes", href: "/automated-screenshots-for-docs" },
      { label: "Living work graph", href: "/ai-help-center" },
      { label: "Briefs and drafts", href: "/ai-documentation-agent" },
    ],
  },
};

export const primaryPages: MarketingPage[] = [
  {
    path: "product",
    eyebrow: "One assistant",
    title: "Keep the context. Finish the work.",
    description:
      "Oppulence is an email-first personal assistant built around your relationships. Bring the history behind a conversation into the next reply, meeting, and follow-up. We are connecting Web, Desktop, and Voice around one memory and one action history.",
    category: "product",
    bullets: [
      "Start on the web. Add Desktop for local files and native tools, or Voice for capture.",
      "Use emails, meetings, and notes as context, with the original sources available for review.",
      "Keep source evidence, private notes, and assistant inferences distinct.",
      "Review proposed replies and actions before they are sent or written.",
      "Shared navigation and the complete Voice-to-relationship handoff are planned work.",
    ],
    proof: ["Source-linked context", "Approval before send", "Optional native apps"],
    ctaLabel: "Start on the web",
    ctaHref: "/sign-up",
  },
  {
    path: "ai-documentation-agent",
    eyebrow: "Revenue Action Queue",
    title: "Know who needs attention, why now, and what to do next.",
    description:
      "Oppulence ranks the ten highest-value actions across warm prospects, dormant opportunities, former customers, and missed commitments, with source evidence attached.",
    category: "feature",
    bullets: [
      "See the relationship history, promise, objection, and opportunity behind every recommendation.",
      "Review an evidence-backed draft instead of reconstructing context from scratch.",
      "Approve, edit, snooze, or reject before anything leaves the system.",
    ],
    proof: baseProof,
    ctaLabel: "See the action queue",
  },
  {
    path: "ai-faq-generator",
    eyebrow: "Reusable Answers",
    title: "Turn repeated answers into living notes and runbooks.",
    description:
      "Oppulence helps recurring explanations become source-linked graph artifacts, so the next agent or operator can reuse them instead of starting from another chat transcript.",
    category: "feature",
    bullets: [
      "Capture recurring answers as editable graph notes.",
      "Keep runbooks tied to source context, owners, and decisions.",
      "Promote high-change answers into live notes that refresh over time.",
    ],
    proof: baseProof,
    ctaLabel: "Explore the graph",
    ctaHref: "/ai-help-center",
  },
  {
    path: "ai-help-center",
    eyebrow: "Revenue Leak Scan",
    title: "Find the warm revenue already hiding in your history.",
    description:
      "Scan the previous 6 months across communication, meetings, calendar, and CRM history for missed commitments and neglected commercial relationships.",
    category: "feature",
    bullets: [
      "Surface unanswered proposals, dormant champions, former customers, and neglected referrals.",
      "Explain why each opportunity matters now with source evidence attached.",
      "Turn the best findings into a short, ranked revenue action queue.",
    ],
    proof: baseProof,
    ctaLabel: "Start building",
    ctaHref: "/sign-up",
  },
  {
    path: "api-documentation-software",
    eyebrow: "Governed Execution",
    title: "Move from recommendation to action without losing control.",
    description:
      "Oppulence separates memory, research, policy, approval, execution, and outcomes so every external action remains explainable and auditable.",
    category: "product",
    bullets: [
      "Apply verification, suppression, frequency, permission, and sender-health rules.",
      "Require approval for high-value or high-risk communications.",
      "Record the rationale, policy decision, edit history, execution result, and outcome.",
    ],
    proof: baseProof,
    ctaLabel: "Plan governed execution",
  },
  {
    path: "automated-screenshots-for-docs",
    eyebrow: "Research and Verification",
    title: "Verify the relationship before preparing the message.",
    description:
      "Confirm account context, the person’s current role and address, and the evidence behind every claim before a recommendation becomes an action.",
    category: "feature",
    bullets: [
      "Research the company and contact with source provenance attached.",
      "Verify current role, address, and contactability before drafting.",
      "Write verified facts back into durable relationship memory.",
    ],
    proof: baseProof,
    ctaLabel: "See verification in context",
  },
  {
    path: "chrome-extension-for-documentation",
    eyebrow: "Research Capture",
    title: "Bring web research into the graph with its source trail intact.",
    description:
      "Oppulence treats external research as source material for the work graph, not disposable browsing context.",
    category: "feature",
    bullets: [
      "Attach web findings to projects, people, accounts, and topics.",
      "Keep provenance attached before agents summarize or reuse the material.",
      "Seed live research notes that can refresh as the topic changes.",
    ],
    proof: baseProof,
    ctaLabel: "Capture research",
  },
  {
    path: "code-to-docs",
    eyebrow: "Workflow Design",
    title: "Turn roles, tools, and contracts into reviewable agent workflows.",
    description:
      "Oppulence gives teams a place to model prompts, handoffs, tools, simulations, and action boundaries before agents run in a product or process.",
    category: "feature",
    bullets: [
      "Model agent roles, prompts, handoffs, source access, and tools.",
      "Attach MCP servers, API actions, and signed webhooks where contracts are clear.",
      "Test behavior before exposing workflows through widgets, APIs, or jobs.",
    ],
    proof: baseProof,
    ctaLabel: "Design a workflow",
  },
  {
    path: "generative-ai-customer-service",
    eyebrow: "Customer Operations",
    title: "Give customer agents the history behind every answer.",
    description:
      "Support and success workflows can answer with relationship history, product context, source-backed memory, and reviewable escalation paths.",
    category: "feature",
    bullets: [
      "Answer from docs, customer context, email, meetings, and connected systems.",
      "Draft follow-ups, tickets, or handoffs when an answer is not enough.",
      "Keep sensitive actions gated by explicit review boundaries.",
    ],
    proof: baseProof,
    ctaLabel: "Map a customer workflow",
  },
  {
    path: "help-center-software",
    eyebrow: "Support Memory",
    title: "A help surface is only useful when the memory behind it stays alive.",
    description:
      "Oppulence starts below the help center: the source-linked graph that powers customer answers, operator briefs, and controlled follow-up workflows.",
    category: "product",
    bullets: [
      "Back customer-facing answers with owned documents and synced operational context.",
      "Use the same graph for product widgets and internal operator workflows.",
      "Move from self-service answers to assisted resolution when the process needs action.",
    ],
    proof: baseProof,
    ctaLabel: "Explore support memory",
  },
  {
    path: "internal-knowledge-base",
    eyebrow: "Team Memory",
    title: "Private team memory that agents can inspect and update.",
    description:
      "Oppulence keeps operational knowledge in transparent notes and graph relationships instead of opaque model memory or scattered SaaS search results.",
    category: "feature",
    bullets: [
      "Store important context in readable, portable notes.",
      "Make relationships explicit across people, projects, decisions, incidents, and policies.",
      "Let workflows refresh high-change notes as new context arrives.",
    ],
    proof: baseProof,
    ctaLabel: "Build team memory",
  },
  {
    path: "lp/ai-help-center",
    eyebrow: "Living Work Graph",
    title: "Launch graph-backed agents without renting your context layer.",
    description:
      "Oppulence gives teams an owned context layer for agents: source-fed, inspectable, and ready for workflows that need more than a prompt.",
    category: "landing",
    bullets: [
      "Start with the living work graph.",
      "Expose graph-backed answers through widgets, API, or desktop workflows.",
      "Scale into live notes, triggers, and controlled tool actions.",
    ],
    proof: baseProof,
    ctaLabel: "Start building",
    ctaHref: "/sign-up",
  },
  {
    path: "multilingual-knowledge-base",
    eyebrow: "Source Federation",
    title: "One graph across the tools and teams around the work.",
    description:
      "Oppulence federates communication, documents, meetings, files, and tool events into one editable graph with provenance intact.",
    category: "feature",
    bullets: [
      "Normalize context from communication, documents, meetings, and tool events.",
      "Keep original references available for review and correction.",
      "Let agents synthesize across source boundaries without manual copy-paste.",
    ],
    proof: baseProof,
    ctaLabel: "Federate sources",
  },
  {
    path: "self-service-help-widget",
    eyebrow: "Embedded Agents",
    title: "Put graph-backed help inside your product or internal tool.",
    description:
      "The Oppulence widget lets product and operations teams expose conversations backed by configured projects, sources, workflows, and tool boundaries.",
    category: "feature",
    bullets: [
      "Bootstrap sessions through the widget API.",
      "Route conversations to the right graph, workflow, and escalation path.",
      "Use RAG and tool calls without rebuilding the agent stack.",
    ],
    proof: baseProof,
    ctaLabel: "Embed an agent",
  },
  {
    path: "self-updating-help-center",
    eyebrow: "Compounding Memory",
    title: "Context that improves between sessions instead of resetting on every prompt.",
    description:
      "Oppulence keeps important subjects alive through live notes and source-fed updates, so future agents start from fresher context.",
    category: "feature",
    bullets: [
      "Track people, projects, deals, topics, and risks over time.",
      "Refresh notes from schedules, events, and source changes.",
      "Use the updated graph in future briefs, drafts, and workflows.",
    ],
    proof: baseProof,
    ctaLabel: "See compounding memory",
  },
  {
    path: "pricing",
    eyebrow: "Pricing",
    title: "Choose how you work with Oppulence.",
    description:
      "Start with the free report. Upgrade when the register becomes part of your weekly workflow.",
    category: "product",
    bullets: [
      "Founders recover warm pipeline from existing communication and CRM history.",
      "Revenue teams add collaboration, policy, verification, and execution telemetry.",
      "Enterprise teams add SSO, permissions, auditability, deployment controls, and support.",
    ],
    proof: baseProof,
  },
  {
    path: "tools/docs-debt-quiz",
    eyebrow: "Tool",
    title: "Find the context debt blocking useful agents.",
    description:
      "Use the context debt quiz to decide which sources, notes, and workflows should enter the graph first.",
    category: "tool",
    bullets: [
      "Score the work traces scattered across inboxes, calls, docs, and tools.",
      "Identify where agents lack enough durable context to be useful.",
      "Prioritize the first sources, live notes, and integrations to configure.",
    ],
    proof: baseProof,
    ctaLabel: "Start the quiz",
  },
  {
    path: "tools/openapi-validator",
    eyebrow: "Tool",
    title: "Validate action contracts before agents depend on them.",
    description:
      "This validator route frames the need for clear MCP, webhook, and API contracts around reviewable agent action paths.",
    category: "tool",
    bullets: [
      "Check that tools expose clear inputs, outputs, and failure modes.",
      "Keep action paths reviewable before agents call external systems.",
      "Use stable contracts across platform and desktop workflows.",
    ],
    proof: baseProof,
    ctaLabel: "Validate a contract",
  },
  // Canonical legal pages live at /terms and /privacy (app/terms, app/privacy).
  // The old /legal/* paths redirect there (see next.config.ts).
];

const blogSlugs = [
  "14-stunning-zendesk-help-center-examples",
  "ai-documentation-generators-the-ultimate-guide",
  "automated-knowledge-base-the-complete-guide",
  "automatic-documentation-made-easy-for-your-business",
  "best-ai-powered-help-center-software-4-of-the-best",
  "best-api-documentation-tools",
  "best-archbee-alternatives",
  "best-document360-alternatives",
  "best-docusaurus-alternatives",
  "best-free-knowledge-base-software",
  "best-gitbook-alternatives",
  "best-help-center-software",
  "best-help-center-software-for-saas",
  "best-help-scout-alternatives",
  "best-helpdocs-alternatives",
  "best-helpjuice-alternatives",
  "best-intercom-help-center-alternatives",
  "best-it-documentation-software",
  "best-knowledge-base-for-small-teams",
  "best-knowledgeowl-alternatives",
  "best-mintlify-alternatives",
  "best-proprofs-knowledge-base-alternatives",
  "best-software-documentation-tools",
  "best-stonly-alternatives",
  "best-technical-writing-tools",
  "best-zendesk-help-center-alternatives",
  "best-zoho-desk-alternatives",
  "building-embeddable-widgets-with-svelte",
  "documentation-drift",
  "docusaurus-pricing",
  "docusaurus-review",
  "freshdesk-pricing",
  "freshdesk-vs-zendesk-review",
  "giorgas-help-center-examples-ecommerce",
  "gitbook-pricing",
  "gitbook-review",
  "gitbook-vs-mintlify",
  "help-desk-providers",
  "help-documentation-software",
  "help-scout-pricing",
  "helpdocs-pricing",
  "helpdocs-review",
  "helpjuice-pricing",
  "helpjuice-review",
  "how-to-hire-a-technical-writer",
  "how-to-keep-knowledge-base-up-to-date-automatically",
  "how-to-price-your-ai-saas-2-mistakes-we-made",
  "how-to-refresh-out-of-date-help-center",
  "how-to-scale-customer-support",
  "how-to-talk-to-users-without-getting-overwhelmed-my-system",
  "knowledge-base-for-saas-startups",
  "knowledge-base-maintenance-checklist",
  "knowledgeowl-pricing",
  "knowledgeowl-review",
  "mintlify-pricing",
  "mintlify-review",
  "open-source-knowledge-base-software",
  "proprofs-kb-pricing",
  "proprofs-kb-review",
  "saas-self-service-strategies",
  "screenshot-size-for-documentation",
  "technical-writer-interview-questions",
  "technical-writer-job-description-template",
  "user-manual-software",
];

// No customer stories yet — we won't ship fabricated testimonials. Add real slugs here
// once there are real stories to tell.
const customerSlugs: string[] = [];

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const known: Record<string, string> = {
        ai: "AI",
        api: "API",
        dso: "DSO",
        it: "IT",
        kb: "KB",
        saas: "SaaS",
        seo: "SEO",
        vs: "vs.",
      };
      return known[part] ?? part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export const blogPages: MarketingPage[] = blogSlugs.map((slug) => ({
  path: `blog/${slug}`,
  eyebrow: "Oppulence Blog",
  title: titleFromSlug(slug),
  description: "A practical guide from the Oppulence team.",
  category: "blog",
  bullets: [
    "What breaks when relationship history stays scattered across tools.",
    "How durable memory changes prioritization, verification, and follow-through.",
    "Where source evidence, policy, approval, execution, and outcomes fit.",
  ],
  proof: baseProof,
  ctaLabel: "Start building",
  ctaHref: "/sign-up",
}));

export const customerPages: MarketingPage[] = customerSlugs.map((slug) => ({
  path: `customers/${slug}`,
  eyebrow: "Customer Story",
  title: `${titleFromSlug(slug)}: a revenue memory story`,
  description:
    "A mapped customer-story route showing how a team could recover warm pipeline with relationship memory and governed actions.",
  category: "customer",
  bullets: [
    "Unify commercial history across conversations, meetings, calendar, and CRM.",
    "Find missed commitments and rank the relationships worth attention.",
    "Verify, govern, approve, execute, and learn from the outcome.",
  ],
  proof: [
    "More warm opportunities recovered before they go cold.",
    "Less manual reconstruction of commercial history.",
    "Every action backed by evidence and policy.",
  ],
  ctaLabel: "See the product loop",
  ctaHref: "/product",
}));

export const indexPages: MarketingPage[] = [
  {
    path: "blog",
    eyebrow: "Blog",
    title: "Guides on chasing silence.",
    description: "Practical notes on follow-up, invoices, and keeping client relationships warm.",
    category: "blog",
    bullets: [
      "Alternatives and comparison pages.",
      "Relationship memory and warm-revenue strategy.",
      "Research, verification, policy, approval, and execution patterns.",
    ],
    proof: baseProof,
  },
  {
    path: "customers",
    eyebrow: "Customers",
    title: "Customer stories are on the way.",
    description:
      "Oppulence is early. We're working with our first operators and teams now. Real stories will land here when there is something concrete to show.",
    category: "customer",
    bullets: [
      "Founder sellers recovering dormant opportunities.",
      "Revenue teams tracking promises, objections, and next actions.",
      "Operators protecting reputation with evidence and policy.",
    ],
    proof: baseProof,
  },
];

export const marketingPages = [...primaryPages, ...indexPages, ...blogPages, ...customerPages];

export const marketingPaths = marketingPages.map((page) => page.path);

export function getMarketingPage(path: string) {
  const page = marketingPages.find((entry) => entry.path === path);
  if (!page) return undefined;
  // Leftover SEO slugs keep Ferndesk-style keyword titles without changing the path.
  return applySeoTheme(page);
}

export const pricingPlans = [
  {
    name: "Watch",
    price: "Free",
    period: "",
    description: "A first pass over recent promises.",
    features: ["6-month report", "What we owe", "Source links"],
    ctaLabel: "Start for free",
    ctaHref: "/sign-up",
  },
  {
    name: "Chase",
    price: "$99",
    period: "/month",
    description: "The live register for your book of business.",
    features: ["All Watch evidence", "At-risk promises", "Approved follow-ups"],
    recommended: true,
    ctaLabel: "Start tracking",
    ctaHref: "/sign-up",
  },
  {
    name: "Intelligence",
    price: "$249",
    period: "/month",
    description: "Change history and proof for renewals, escalations, and handovers.",
    features: ["All Chase workflows", "Change summaries", "Exportable records"],
    ctaLabel: "Start tracking",
    ctaHref: "/sign-up",
  },
];

/**
 * The three ways people actually run Oppulence. Each gets its own page at
 * /web, /desktop, and /voice-app so the nav can point at a product rather than
 * a feature essay. Desktop and Voice both ship an installer, so their pages
 * link to their respective download options.
 */
export type PlatformPage = {
  slug: string;
  name: string;
  eyebrow: string;
  title: string;
  lede: string;
  /** Shown as a one-line answer to "what is this, concretely?" */
  summary: string;
  screenshot: string;
  screenshotAlt: string;
  /** Whether this product has a download rather than browser sign-up. */
  download: boolean;
  cta: { label: string; href: string };
  availability: { current: string; planned: string };
  setup: { title: string; body: string }[];
  faqs: { question: string; answer: string }[];
  closing: { title: string; body: string };
  sections: {
    status?: string;
    title: string;
    body: string;
    bullets: string[];
    screenshot: string;
    alt: string;
  }[];
  specs: { term: string; detail: string }[];
};

export const platformPages: PlatformPage[] = [
  {
    slug: "web",
    name: "Oppulence Web",
    eyebrow: "Your work, organized",
    title: "Pick up the conversation. Know what comes next.",
    lede: "The browser workspace for the people, promises, and conversations behind your work. Review the history, inspect the evidence, and decide what the assistant should do next.",
    summary:
      "Review relationships, source evidence, and proposed actions in your browser. No desktop installation required.",
    screenshot: "/marketing/relationship-web-list.png",
    screenshotAlt:
      "Oppulence Web relationship workspace showing accounts, open commitments, and next actions with example data",
    download: false,
    cta: { label: "Start on the web", href: "/sign-up" },
    availability: {
      current:
        "Start with the browser workspace: connected sources, relationship views, assistant work, and action approvals.",
      planned:
        "A new email-first workspace with Today, a full Inbox, People, Library, and Activity, plus the complete Voice-to-relationship handoff.",
    },
    sections: [
      {
        title: "The thread is only part of the story.",
        body: "A customer asks about a deadline. The answer may be in an earlier email, a calendar event, or a promise someone made last week. Open the relationship to see the relevant history and the work still waiting on a decision.",
        bullets: [
          "Review people and companies in one workspace",
          "See open commitments and proposed next steps",
          "Correct relationship details when the context is wrong",
        ],
        screenshot: "/marketing/relationship-web-detail.png",
        alt: "Relationship detail showing an open security review, people, and an evidence timeline",
      },
      {
        title: "Check the reason before you approve the action.",
        body: "A useful suggestion should explain itself. Inspect the source behind a recommendation, review the proposed action, and decide whether it should go ahead. A draft is a decision for you to make.",
        bullets: [
          "Follow recommendations back to their evidence",
          "Review proposed email, Slack, calendar, and CRM actions",
          "Check the outcome after an action runs",
        ],
        screenshot: "/marketing/relationship-web-detail.png",
        alt: "Proposed follow-up with Approve and Reject controls above its source evidence",
      },
      {
        status: "In development",
        title: "Your next reply, with the history beside it.",
        body: "We are bringing email to the center of Web. Today will surface work that needs a decision. Inbox will put relevant meetings and earlier correspondence beside the reply. People, Library, and Activity will keep the history, sources, and results within reach.",
        bullets: [
          "Today: replies to review and people you are waiting on",
          "Inbox: prepared responses with supporting context",
          "People, Library, and Activity: history you can inspect",
        ],
        screenshot: "/marketing/desktop-email.png",
        alt: "Existing Desktop email view illustrating the direction for the planned Web inbox",
      },
    ],
    specs: [
      { term: "Where it runs", detail: "In your browser" },
      { term: "Best for", detail: "Relationships, source review, and approvals" },
      { term: "Installation", detail: "None required" },
    ],
    setup: [
      {
        title: "Create your workspace",
        body: "Sign in from your browser. You can start without installing Desktop or Voice.",
      },
      {
        title: "Connect the sources you need",
        body: "Choose the supported services that hold your work and review the access you grant.",
      },
      {
        title: "Start with one relationship",
        body: "Inspect its history, check an open commitment, and review a proposed next step.",
      },
    ],
    faqs: [
      {
        question: "Do I need to install another app?",
        answer:
          "No. Web runs in your browser. Desktop is an optional workspace for local files and native tools; Voice is an optional companion for dictation and capture.",
      },
      {
        question: "Is the full email inbox available today?",
        answer:
          "The browser workspace has relationship views, connected sources, assistant work, and approvals. The redesigned Today, Inbox, People, Library, and Activity experience is in development. The Desktop email view shown here illustrates that direction.",
      },
      {
        question: "Can I keep using my existing email app?",
        answer:
          "Yes. You can keep working in your existing email app while using Oppulence to inspect relationship context and review assistant work. The new Oppulence inbox is an additional experience being developed.",
      },
      {
        question: "Will the assistant send messages on its own?",
        answer:
          "Supported external writes are proposed for human approval. Review the content and destination before approving, then check the action result. An attempted action is not proof that it completed.",
      },
      {
        question: "Does signing in upload my local notes?",
        answer:
          "Signing in to Web does not make a local Desktop or Voice library available in the browser. The shared experience is being built around explicit transfer and sharing choices.",
      },
    ],
    closing: {
      title: "Start with the conversation that needs you.",
      body: "Open your workspace, bring the relevant history into view, and choose the next step.",
    },
  },
  {
    slug: "desktop",
    name: "Oppulence Desktop",
    eyebrow: "Your full working environment",
    title: "Bring your files into the conversation.",
    lede: "Email, local notes, documents, and a browser in one native workspace. Give the assistant the context you choose, work beside the original material, and stay with the task from research to reply.",
    summary:
      "A native workspace for email, local files, a Markdown vault, and deeper work with the assistant.",
    screenshot: "/marketing/desktop-home.png",
    screenshotAlt:
      "Oppulence Desktop workspace with local notes, email, and an assistant panel using example data",
    download: true,
    cta: { label: "Download Desktop", href: "/download#desktop" },
    availability: {
      current:
        "Desktop brings together email, meeting capture, local Markdown notes, an embedded browser, and background tasks. Choose a supported release for your operating system.",
      planned:
        "We are aligning Desktop and Web around Today, Inbox, People, Library, and Activity. Shared relationship context and action history across the full experience remain in development.",
    },
    sections: [
      {
        title: "Your working notes. In ordinary files.",
        body: "Keep research, customer notes, and project material in a Markdown vault you can open and back up. Ask the assistant about the material you make available, then inspect the original before relying on the answer.",
        bullets: [
          "Search local notes and documents",
          "Keep the source beside the assistant",
          "Open, edit, and back up your Markdown files",
        ],
        screenshot: "/marketing/desktop-knowledge.png",
        alt: "Desktop Markdown vault with customer notes, live notes, and a contextual assistant",
      },
      {
        title: "Move from the meeting to the reply.",
        body: "Keep email, captured meetings, and your notes in the same workspace. Read the thread, find the relevant material, and prepare the response with the assistant beside you. Review the wording and sources before the reply leaves your hands.",
        bullets: [
          "Work through email in the native workspace",
          "Review meeting notes and transcripts",
          "Keep private interpretations distinct from source evidence",
        ],
        screenshot: "/marketing/desktop-email.png",
        alt: "Desktop email workspace with the current conversation and assistant side panel",
      },
      {
        title: "Stay with the task when it gets bigger.",
        body: "Open a reference in the embedded browser, navigate with the keyboard, and inspect work handled by background tasks. When you need to investigate how notes connect, open the knowledge graph and follow the details.",
        bullets: [
          "An embedded browser for research",
          "Background tasks with a history to inspect",
          "Connected tools and an explorable knowledge graph",
        ],
        screenshot: "/marketing/desktop-background-tasks.png",
        alt: "Desktop background task list showing work and run history",
      },
    ],
    specs: [
      { term: "Where it runs", detail: "macOS, Windows, and Linux releases" },
      { term: "Best for", detail: "Local context and sustained work" },
      { term: "Your notes", detail: "A local Markdown vault" },
    ],
    setup: [
      {
        title: "Choose your release",
        body: "Open the download page and select the available installer for your operating system.",
      },
      {
        title: "Set up your workspace",
        body: "Choose your model configuration and connect the accounts and tools you want to use.",
      },
      {
        title: "Bring in one piece of work",
        body: "Open a note, document, or email. Ask a specific question and inspect the material behind the answer.",
      },
    ],
    faqs: [
      {
        question: "How is Desktop different from Web?",
        answer:
          "Desktop adds a local Markdown vault, files on your computer, an embedded browser, native controls, and background tasks. Web is the browser workspace. We are aligning their everyday navigation and relationship workflows.",
      },
      {
        question: "Is everything processed locally?",
        answer:
          "No. Local storage and local processing are different choices. Your vault can live on your computer, while a configured cloud model or connected service may receive content needed for a request. Review your provider and tool configuration.",
      },
      {
        question: "Can I use my own model provider?",
        answer:
          "Desktop supports configurable model providers, including supported cloud providers and local model setups. Available capabilities depend on the provider, model, and tools you configure.",
      },
      {
        question: "Are my files automatically shared with Web?",
        answer:
          "Signing in does not turn your private vault into a shared library. The connected Web and Desktop experience is being developed around explicit sharing of selected material.",
      },
      {
        question: "Do I also need Voice?",
        answer:
          "No. Desktop is useful on its own. Voice is a separate, optional download for global dictation, floating capture controls, and working by voice in other applications.",
      },
    ],
    closing: {
      title: "Give the work a little more room.",
      body: "Bring your notes, files, and conversations into a workspace built for the task in front of you.",
    },
  },
  {
    slug: "voice-app",
    name: "Oppulence Voice",
    eyebrow: "Your assistant within reach",
    title: "Say it. Keep working.",
    lede: "Speak into the app you are already using. Dictate a reply, capture a thought, or record a meeting through a lightweight companion that stays within reach.",
    summary:
      "An optional desktop companion for dictation, meeting recording, selected-text editing, and thought capture.",
    screenshot: "/marketing/voice-hotkeys.png",
    screenshotAlt:
      "Voice settings for dictation, voice assistant, translation, and meeting hotkeys",
    download: true,
    cta: { label: "Download Voice", href: "/download#voice" },
    availability: {
      current:
        "Use Voice for dictation, selected-text editing, meeting capture, and local or cloud transcription. It can be used independently of Oppulence Desktop.",
      planned:
        "Ask Oppulence will connect the floating panel to the shared assistant. Reviewing relationship matches and publishing accepted captures into relationship history are still in development.",
    },
    sections: [
      {
        title: "The cursor is already in the right place.",
        body: "Press your dictation shortcut and speak into the email, document, or message you are writing. Use selection editing to revise a passage without moving the whole task into a chat window.",
        bullets: [
          "Choose a global hotkey that fits your workflow",
          "Insert text at the cursor in supported apps",
          "Revise selected text where you are working",
        ],
        screenshot: "/marketing/voice-hotkeys.png",
        alt: "Configurable dictation hotkey with tap or hold activation and voice assistant shortcuts",
      },
      {
        title: "Capture it before the details disappear.",
        body: "Record a meeting with appropriate consent, or speak a note while the thought is fresh. Review the transcript and speakers afterward. A personal observation remains your perspective; it is not the same as something a customer said.",
        bullets: [
          "Visible controls while recording",
          "Transcripts and speaker corrections",
          "Private notes you can review before sharing",
        ],
        screenshot: "/marketing/voice-integrations.png",
        alt: "Voice meeting and integration settings",
      },
      {
        title: "Choose where your words are processed.",
        body: "Select a local transcription engine when you want audio processed on your device, or configure a cloud provider. Add names and specialized terms to your vocabulary so recurring words are easier to capture correctly.",
        bullets: [
          "Local and cloud transcription options",
          "Provider settings you can inspect",
          "Custom vocabulary for names and terms",
        ],
        screenshot: "/marketing/voice-transcription.png",
        alt: "Speech-to-text settings showing available local and cloud transcription choices",
      },
    ],
    specs: [
      { term: "Where it runs", detail: "A lightweight desktop companion" },
      { term: "Best for", detail: "Dictation, thoughts, and meetings" },
      { term: "Transcription", detail: "Your choice of local or cloud" },
    ],
    setup: [
      {
        title: "Install the companion",
        body: "Choose an available Voice release. You do not need to install the full Desktop workspace first.",
      },
      {
        title: "Choose an engine and shortcut",
        body: "Select local or cloud transcription, set your hotkey, and grant the permissions required for capture.",
      },
      {
        title: "Try it in your next reply",
        body: "Place your cursor in a supported app, speak a short draft, and review the text before sending.",
      },
    ],
    faqs: [
      {
        question: "Does Voice require Oppulence Desktop?",
        answer:
          "No. Voice is an optional, separate application and can be used on its own. Install Desktop when you also want the full workspace for local files, email, and deeper review.",
      },
      {
        question: "Does my audio leave my device?",
        answer:
          "It depends on your configuration. A selected local transcription engine processes speech on the device. Cloud transcription sends audio to that provider, and cloud assistant features may send text or other selected context for processing.",
      },
      {
        question: "Can I use it in my existing email or messaging app?",
        answer:
          "Dictation inserts text at the cursor in supported applications. Permissions and behavior can vary by operating system and app. Start with a short draft and review the result before sending.",
      },
      {
        question: "Will recordings automatically appear in People?",
        answer:
          "No. The full capture-to-relationship experience is in development. It is being designed to let you review speakers, confirm relationship matches, and choose which artifacts to share.",
      },
      {
        question: "Is Ask Oppulence connected to the same assistant yet?",
        answer:
          "That shared connection is planned. Today, Voice has its own standalone capabilities. The goal is to ask about a person, email, meeting, or note from the floating panel and open the full workspace for a larger review.",
      },
    ],
    closing: {
      title: "Keep the thought. Keep your place.",
      body: "Add Voice when speaking is the easiest way to get the next sentence down.",
    },
  },
];

export function getPlatformPage(slug: string) {
  return platformPages.find((page) => page.slug === slug);
}
