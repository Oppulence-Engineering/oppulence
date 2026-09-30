/**
 * Tool ids are what the agent runtime grants. The agents page and the
 * configuration picker show the label. Tools missing from the picker still
 * need a label when a built-in agent already has them.
 */
export const AGENT_TOOL_CATALOG = [
  {
    name: "current_time",
    label: "Current time",
    description: "Read the current date and time.",
  },
  {
    name: "web.search",
    label: "Web search",
    description: "Search the web for current information.",
  },
  { name: "echo", label: "Echo", description: "Send a short message back, to confirm this agent can use a tool." },
  {
    name: "tool_result.read",
    label: "Tool results",
    description: "Read results produced by another tool.",
  },
  {
    name: "relationship.read",
    label: "Read workspace memory",
    description:
      "Read companies, people, conversations, notes, tasks, commitments, risks, and source health.",
  },
  {
    name: "source.retry_sync",
    label: "Retry source sync",
    description: "Try syncing a source again. This does not reconnect the account.",
  },
  {
    name: "task.create",
    label: "Create task",
    description: "Create an Oppulence task; never send a message or calendar invite.",
  },
  {
    name: "task.update",
    label: "Edit task",
    description: "Edit an Oppulence task title, due time, or priority; never send anything.",
  },
  {
    name: "task.complete",
    label: "Complete task",
    description: "Complete an Oppulence task; cannot dismiss other actions or send anything.",
  },
  {
    name: "task.snooze",
    label: "Snooze task",
    description: "Snooze an Oppulence task until a future time; never send anything.",
  },
  {
    name: "note.create",
    label: "Create note",
    description: "Create an Oppulence note; never send a message or external event.",
  },
  {
    name: "note.update",
    label: "Edit note",
    description: "Edit a note. Earlier versions stay in its history.",
  },
  {
    name: "note.delete",
    label: "Delete note",
    description: "Delete a note. The history keeps a record that it was removed.",
  },
  {
    name: "action.propose",
    label: "Propose finance action",
    description: "Ask for approval before a finance action runs.",
  },
  {
    name: "slack.read_thread",
    label: "Read Slack",
    description: "Read messages from a Slack thread.",
  },
  {
    name: "slack.post_message",
    label: "Post to Slack",
    description: "Send a Slack message after you approve it.",
  },
  {
    name: "connector.read.gmail",
    label: "Read Gmail",
    description: "Read connected Gmail messages.",
  },
  {
    name: "connector.write.gmail_draft",
    label: "Draft email",
    description: "Create a Gmail draft for review.",
  },
  {
    name: "connector.write.gmail_send",
    label: "Send email",
    description: "Send a Gmail message after you approve it.",
  },
  {
    name: "connector.read.calendar",
    label: "Read calendar",
    description: "Read connected calendar events.",
  },
  {
    name: "connector.write.calendar_create",
    label: "Create event",
    description: "Create a calendar event.",
  },
  {
    name: "connector.write.calendar_update",
    label: "Update event",
    description: "Update an existing calendar event.",
  },
  { name: "connector.read.drive", label: "Read Drive", description: "Read connected Drive files." },
  {
    name: "connector.write.drive_update",
    label: "Update Drive",
    description: "Update connected Drive files.",
  },
  {
    name: "connector.read.hubspot_search",
    label: "Search HubSpot",
    description: "Find records in the connected HubSpot account.",
  },
  {
    name: "connector.write.hubspot_note",
    label: "Add HubSpot note",
    description: "Attach a note to a HubSpot record.",
  },
  {
    name: "connector.write.hubspot_task",
    label: "Create HubSpot task",
    description: "Create a follow-up task in HubSpot.",
  },
  {
    name: "conduit.read",
    label: "Read Conduit",
    description: "Read revenue context from Conduit.",
  },
  {
    name: "eigen.simulate",
    label: "Run simulation",
    description: "Run an Eigen scenario simulation.",
  },
  {
    name: "demo.payment",
    label: "Payment demo",
    description: "Practice an approval. No money moves.",
  },
] as const;

/**
 * Echo, the payment demo, Conduit, and Eigen are developer surfaces. They stay
 * in the catalog so a saved grant can still be shown, and stay out of the
 * picker until this agent already has them.
 */
export const DEVELOPER_TOOL_NAMES = new Set<string>([
  "echo",
  "demo.payment",
  "conduit.read",
  "eigen.simulate",
]);

/** Granted on built-in agents, and not offered in the picker until a teammate adds them. */
const GRANTED_TOOL_LABELS: Record<string, string> = {
  "run_history.read": "Past runs",
  "workflow.read": "Workflows",
  "workspace.read": "Workspaces",
  "relationship.create": "Add a company",
  "relationship.correct": "Correct a company",
  "relationship.assertion.retract": "Remove a recorded fact",
  "relationship.review.acknowledge": "Acknowledge a review",
  "relationship.identity.decide": "Review a possible duplicate",
  "relationship.attention.decide": "Update an attention item",
  "conversation.delete": "Delete a conversation",
  "recommendation.create": "Create a recommendation",
  "recommendation.dismiss": "Dismiss a recommendation",
  "recommendation.snooze": "Snooze a recommendation",
  "recommendation.update": "Edit a recommendation",
  "action.audit": "Review an action",
  "action.outcome.record": "Record an outcome",
  "commitment.export": "Export commitments",
  "commitment.accept": "Accept a commitment",
  "commitment.block": "Block a commitment",
  "commitment.confirm": "Confirm a commitment",
  "commitment.correct": "Correct a commitment",
  "commitment.complete": "Complete a commitment",
  "commitment.dispute": "Dispute a commitment",
  "commitment.unblock": "Unblock a commitment",
  "person.create": "Add a person",
  "person.correct": "Correct a person",
  "person.attribute.retract": "Remove a profile field",
  "person.identity.decide": "Review a possible duplicate person",
  "person.delete": "Remove a person",
  "action_proposal.read": "Read proposed actions",
  "subagent.delegate": "Delegate to an agent",
  "connector.read.composio_tool_search": "Find a connected action",
  "connector.read.composio_tool_describe": "Read a connected action",
  "connector.write.composio_tool_execute": "Run a connected action",
};

export function agentToolLabel(name: string): string {
  const catalog = AGENT_TOOL_CATALOG.find((tool) => tool.name === name);
  if (catalog) return catalog.label;
  const granted = GRANTED_TOOL_LABELS[name];
  if (granted) return granted;
  const words = name.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
