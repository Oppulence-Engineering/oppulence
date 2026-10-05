/**
 * The product opens this reference from Help and the sidebar. The API process
 * still publishes the document as "Solomon AI", including its HTML page. We
 * keep the spec and replace the heading, section names, and field descriptions
 * a person reads. Path parameter text stays, because generated clients use it.
 * The viewer chrome that only exists on a developer machine — Ask AI, Generate
 * MCP, Developer Tools, and the API client — stays off, because this page is
 * the product reference.
 */
export const API_REFERENCE_TITLE = "Oppulence API";

export const API_REFERENCE_DESCRIPTION =
  "Oppulence API for sign-in, billing, workflows, companies, people, and promises.";

/**
 * Stored tag names are the API's. The reference a person opens uses the same
 * words as the rest of the product, and operations stay attached by rewriting
 * their tag list to the same names.
 */
const API_REFERENCE_TAGS: Record<string, { name: string; description: string }> = {
  Auth: {
    name: "Sign-in",
    description: "Sign-in before this workspace has a session.",
  },
  "Background Tasks": {
    name: "Background work",
    description: "Work that keeps running in Oppulence Cloud, including its files and run state.",
  },
  LLM: {
    // "Models" is already the schema list in the reference sidebar.
    name: "Model calls",
    description: "Text, chat, embeddings, and the model list. Each call uses workspace credits.",
  },
  Voice: {
    name: "Voice",
    description: "Spoken replies. Each call uses workspace credits.",
  },
  "Oppulence Voice": {
    name: "Oppulence Voice",
    description: "API keys, capture sync, and saved recordings for this workspace.",
  },
  Search: {
    name: "Search",
    description: "Web search. Each call uses workspace credits.",
  },
  "Google OAuth": {
    name: "Google",
    description: "Connect Google from the browser or the desktop app.",
  },
  Connectors: {
    name: "Connections",
    description: "Connected tools, their sign-in, and disconnect.",
  },
  Webhooks: {
    name: "Webhooks",
    description: "Callbacks from sign-in infrastructure.",
  },
  "Relationship Intelligence": {
    name: "Companies and people",
    description: "Companies, people, promises, and the details behind them.",
  },
  Revenue: {
    name: "Promises",
    description: "Promises, approvals, and the check before a message is sent.",
  },
  Console: {
    name: "Preferences",
    description: "Preferences that follow this account across devices.",
  },
  Entities: {
    name: "Records",
    description: "The records this organization keeps.",
  },
  Internal: {
    name: "Internal",
    description: "Routes for Oppulence services. The signed-in app does not call these.",
  },
  GraphQL: {
    name: "Admin",
    description: "Admin queries for this workspace.",
  },
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

/** Sidebar titles. The stored summary is the route's name, not the product's. */
const API_REFERENCE_SUMMARIES: Record<string, string> = {
  "Get connector broker JWKS": "Get connection signing keys",
  "Create background task mirror": "Save a background task",
  "Delete background task mirror": "Delete a background task",
  "Get background task mirror": "Get a background task",
  "Patch background task mirror": "Update a background task",
  "Create task run mirror": "Record a task run",
  "Patch task run mirror": "Update a task run",
  "Mint connector MCP token": "Create a connection token",
  "Correct reviewed conversation evidence": "Correct a reviewed conversation",
  "Open source evidence": "Open the original detail",
  "Get evidence timeline": "Get the activity history",
  "Request policy preflight": "Check before sending",
  "Link the OutboundConsole workspace": "Link the sending workspace",
  "List account background task runs": "List background runs",
  "List background task templates": "List workflow templates",
  "List task run logs": "List run events",
  "Append task run logs": "Add run events",
  "Stream task run progress": "Follow a run",
  "Poll task run status": "Check a run",
  "Get background task template": "Get a workflow template",
  "Instantiate background task template": "Create a workflow from a template",
  "List background tasks": "List background work",
  "Ensure first-party workflows": "Install maintained workflows",
  "Get task artifact": "Get the workflow note",
  "Put task artifact": "Save the workflow note",
  "List task runs": "List runs for a workflow",
  "Get task run": "Get a run",
  "Cancel API-worker run": "Cancel a cloud run",
  "Retry API-worker run": "Retry a cloud run",
  "Signal API-worker run": "Pause or resume a cloud run",
  "Queue or start task trigger": "Start a workflow run",
};

/**
 * The stored description is the route's implementation note. These are the
 * sentences a person reads under the title.
 */
const API_REFERENCE_DESCRIPTIONS: Record<string, string> = {
  "List account background task runs":
    "Lists background runs for this account, including queued, running, and failed cloud runs.",
  "List background task templates":
    "Lists built-in workflow templates. Each one includes instructions and a start time you can use as-is.",
  "List task run logs":
    "Returns the events for a run, in order. Pass the last event you have seen to fetch only newer ones.",
  "Append task run logs": "Adds events to a run. Sending the same event again does not create a duplicate.",
  "Stream task run progress": "Streams events for a run until it finishes or you disconnect.",
  "Poll task run status": "Returns a short status for one run.",
  "Get background task template":
    "Gets one built-in workflow template, including its instructions and when it starts.",
  "Instantiate background task template":
    "Creates a workflow from a built-in template. It belongs to the signed-in person and runs the same way as a workflow they created.",
  "List background tasks": "Lists background work for the signed-in person.",
  "Create background task mirror":
    "Saves a background task. If no name is given, Oppulence API makes one from the title. Names are unique for each person.",
  "Ensure first-party workflows":
    "Installs or updates the maintained workflows for the signed-in person. Paused workflows stay paused.",
  "Delete background task mirror":
    "Deletes the background task and its note, runs, and run events after checking the current revision.",
  "Get background task mirror": "Gets one background task for the signed-in person.",
  "Patch background task mirror":
    "Updates part of a background task. Send the revision from the last read. A stale write returns the current revision so you can retry.",
  "Get task artifact":
    "Returns the note for this workflow. If there is no note yet, the response is empty so you can create one.",
  "Put task artifact": "Saves the note for this workflow. Updates need the current revision.",
  "List task runs": "Lists runs for one workflow.",
  "Create task run mirror":
    "Records a run that started on the desktop. Start a workflow run when someone queues a new one from Oppulence.",
  "Get task run": "Gets one workflow run, including its progress.",
  "Patch task run mirror":
    "Updates a run. The desktop should mark queued runs as running, succeeded, or failed as it finishes them.",
  "Cancel API-worker run":
    "Cancels a cloud run and records that it stopped. A run that stays on the desktop is left unchanged.",
  "Retry API-worker run": "Starts a new cloud run from the previous one.",
  "Signal API-worker run": "Pauses, resumes, or updates a cloud run between steps.",
  "Queue or start task trigger":
    "Queues a desktop run, or starts a cloud run. Check the run until it finishes.",
};

type ApiReferenceOperation = { tags?: string[]; summary?: string; description?: string };

type ApiReferenceDocument = {
  info?: { title?: string; description?: string };
  externalDocs?: { description?: string; url?: string };
  servers?: Array<{ url?: string; description?: string }>;
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, Record<string, ApiReferenceOperation | undefined>>;
};

function presentedTagName(name: string): string {
  return API_REFERENCE_TAGS[name]?.name ?? name;
}

/**
 * Prose still names the old product, internal RFCs, and the sending service.
 * Replacements stay phrase-sized so a sentence does not lose its verb.
 * Four-digit RFC numbers are public standards (dates, keys, problem details)
 * and stay. Three-digit numbers are internal design notes and come out.
 */
/**
 * Field notes that stay after the phrase pass. Each one is a full sentence
 * from the published spec, matched after the older product names are gone.
 */
/**
 * One stored sample, "active", is copied onto every status column. A background
 * run cannot be active. The sample stays only when the field lists it.
 */
const GENERIC_STATUS_DESCRIPTION =
  "Lifecycle/status slug. Subscription rows use billing states; background task runs use queued/running/succeeded/failed/stopped.";

/** The published sample, or the first allowed value when that sample is not allowed. */
export function statusSample(values: readonly string[], example: string): string {
  return values.includes(example) ? example : (values[0] ?? example);
}

const API_REFERENCE_FIELD_NOTES: ReadonlyArray<readonly [string, string]> = [
  [
    GENERIC_STATUS_DESCRIPTION,
    "Status. Plans use billing states. Background runs use queued, running, succeeded, failed, or stopped.",
  ],
  [
    "Provider slug. Depending on the row this may be an OAuth provider, LLM provider, or execution backend.",
    "Which service this uses. That can be a sign-in service, a model provider, or where the work runs.",
  ],
  ["Stable connector slug.", "Connection name."],
  ["Bound connector slug.", "Connection this applies to."],
  ["Connector slug.", "Connection name."],
  ["Workflow id for API-worker runs.", "Workflow id for cloud runs."],
  ["Run id for API-worker runs.", "Run id for cloud runs."],
  [
    "Stable per-user background task slug matching bg-tasks/<slug> locally.",
    "Short name for this background task. It stays the same for this person.",
  ],
  ["Billing plan slug.", "Billing plan."],
  ["Artifact acknowledgement.", "Confirmation that this was saved."],
  ["Default agent slug; empty clears the selection.", "Default agent. Empty clears the selection."],
  [
    "Optional x-solomon-agent-name header captured for cost allocation.",
    "Optional agent name, kept for usage tracking.",
  ],
  [
    "Optional x-solomon-sub-use-case header captured for cost allocation.",
    "Optional detail for usage tracking.",
  ],
  [
    "Optional x-solomon-use-case header captured for cost allocation.",
    "Optional usage category, kept for usage tracking.",
  ],
  [
    "A task with this slug already exists for the user.",
    "A task with this name already exists for this person.",
  ],
  [
    "Redirect to solomon-ai://connection-complete with connector and status.",
    "Redirects back to the desktop app with the connection and status.",
  ],
  [
    "Validates an active non-revoked connection, exact audience, granted scope subset, current catalog availability, and current entitlement. OAuth credentials are refreshed and rotated server-side, then rowboat-api returns an RS256 product token carrying bounded actor claims. Provider tokens and API keys are never returned.",
    "Checks that the connection is still allowed, then returns a short-lived token for this person. Passwords and provider keys are not returned.",
  ],
  ["Payload exceeds the configured size cap.", "This is larger than the size limit."],
  ["Markdown artifact body for a background task.", "Note for this background task."],
  ["Server timestamp for the last artifact update.", "When this note was last updated."],
  [
    "Current artifact revision. Required for updates to an existing artifact.",
    "Current note revision. Required when updating a note that already exists.",
  ],
  [
    "Optional stable slug. If omitted, rowboat-api slugifies name.",
    "Optional short name. If omitted, Oppulence makes one from the name.",
  ],
  [
    "Task list for the authenticated user, ordered by slug.",
    "Background tasks for the signed-in person, in name order.",
  ],
  [
    "Optional event type. If omitted, rowboat-api reads event.type when present.",
    "Optional event type. If omitted, Oppulence uses event.type when it is present.",
  ],
  [
    "Batch append for JSONL run events. Existing seq values are skipped to make retries idempotent.",
    "Adds a batch of run events. An event number that already exists is skipped, so retrying is safe.",
  ],
  ["Task slug.", "Task name."],
  [
    "Optional signal payload. update_context can carry context/text/requestedContext for the next runtime checkpoint.",
    "Optional details for a pause, resume, or update.",
  ],
  ["Stable template slug.", "Template name."],
  [
    "Default task slug used when instantiating this template.",
    "Default name used when creating a workflow from this template.",
  ],
  ["Task slug override. Defaults to template.taskSlug.", "Name override. Uses the template name when empty."],
  ["Stable logical artifact id.", "Id for this capture."],
  ["Artifact kind.", "Capture type."],
  ["Artifact schema version.", "Capture version."],
  [
    "Stored cloud event. payload and routing appear only on the detail endpoint.",
    "Stored event. The contents appear only when you open the event.",
  ],
  [
    "Decrypted normalized provider payload. Detail endpoint only.",
    "Event contents. Only included when you open the event.",
  ],
  [
    "Events in this page (payload omitted).",
    "Events on this page. Contents are left out until you open one.",
  ],
  ["Slug of the task the run executed.", "Name of the task this run used."],
  ["Saved graph view payload.", "Saved graph view."],
  [
    "One caller-owned console artifact in the asserted workspace.",
    "One saved preference for this workspace.",
  ],
  ["Create a typed console artifact.", "Create a saved preference."],
  ["Durable console artifact kind.", "Kind of saved preference."],
  [
    "Update mutable artifact fields. Kind and ownership are immutable.",
    "Updates a saved preference. Its kind and owner stay the same.",
  ],
  ["Event payload.", "Event details."],
  ["Pinned agent slug.", "Agent used for this session."],
  [
    "Human-readable gist used in routing prompts. Defaults to a compact payload summary when omitted.",
    "Short text used to decide where this event goes. Oppulence writes a short summary when this is left empty.",
  ],
  [
    "OpenAI-compatible chat completions request. rowboat-api requires model, gates credits, rewrites routable model ids, and passes through other fields.",
    "Chat request. Oppulence requires a model, checks credits, and passes the other fields through.",
  ],
  [
    "When true, rowboat-api streams server-sent events and asks the upstream to include usage.",
    "When true, Oppulence streams the reply and includes how many credits it used.",
  ],
  [
    "Text, multimodal content array, or provider-specific content payload.",
    "Text, or other content the model accepts.",
  ],
  [
    "Ephemeral one-time OAuth handoff ticket with sealed payload and expiry.",
    "A one-time sign-in handoff that expires.",
  ],
  [
    "AES-GCM sealed OAuth handoff payload. Internal storage field.",
    "Stored sign-in handoff. This field is internal.",
  ],
  ["Hash of summary, facts, and sealed payload.", "Hash of the summary and the stored facts."],
  [
    "Preflight state. Facade unavailability keeps pending (fail closed).",
    "Sending check. If the check is unavailable, the action stays pending.",
  ],
  [
    "Mapping between the Oppulence workspace and the canonical sending workspace. Local mode has no link: observation and draft-only execution work while preflight and sends stay disabled.",
    "Mapping between the Oppulence workspace and the sending workspace. Without a link, drafts still work and sending stays off.",
  ],
  [
    "Revision conflict returned when the caller edits a stale task, artifact, or run revision. Clients should refetch, merge, and retry with currentRevision.",
    "The note or run changed since it was read. Read it again, then retry with the current revision.",
  ],
  [
    "State ticket from the solomon-ai://oauth/slack/done deep link.",
    "State ticket from the Slack sign-in return.",
  ],
  [
    "HTML page that redirects to solomon-ai://oauth/google/done.",
    "Page that returns to the desktop app after Google sign-in.",
  ],
  [
    "HTML page that redirects to solomon-ai://oauth/slack/done.",
    "Page that returns to the desktop app after Slack sign-in.",
  ],
  ["Google refresh token payload.", "Stored Google refresh token."],
  ["Refresh token payload.", "Stored refresh token."],
  ["Saved task artifact.", "Saved workflow note."],
  ["Task artifact.", "Workflow note."],
  ["Artifact body and optional revision.", "Note text and an optional revision."],
  ["Signal payload.", "Details for a pause, resume, or update."],
  ["Capture artifact.", "Capture."],
  ["Ingest consented capture artifact", "Save a capture the person allowed"],
  ["Artifact status.", "Capture status."],
  [
    "Creates a typed artifact. Replaying a note favorite returns the existing resource.",
    "Saves a preference. Saving the same note favorite again returns the one that already exists.",
  ],
  [
    "Validates the complete resulting kind-specific payload before updating.",
    "Checks the full preference before saving the update.",
  ],
  [
    "Lists the authenticated user's ingested events ordered by receivedAt descending. Payload is omitted from list responses; fetch the detail endpoint for it.",
    "Lists this person's events, newest first. Open an event to read its contents.",
  ],
  [
    "Returns one event including the decrypted payload and the routing decision summary.",
    "Returns one event, including its contents and where it was sent.",
  ],
  ["Raw provider payload, sealed at rest.", "Original event, stored privately."],
  [
    "Returns one observation plus its decrypted raw payload. Tenant ownership is enforced before decryption.",
    "Returns one observation, including its original contents, after checking it belongs to this workspace.",
  ],
  ["Decrypted provider payload.", "Original event contents."],
  [
    "Requests or retries the sending check for the current revision and stores the immutable decision snapshot. A fresh unexpired decision for the same revision is returned without provider cost. Facade unavailability keeps the action pending (fail closed).",
    "Runs the sending check again for this revision and keeps the decision. A recent decision for the same revision is reused. If the check is unavailable, the action stays pending.",
  ],
  ["Policy facade unavailable; the action stays pending.", "The sending check is unavailable, so the action stays pending."],
  [
    "Returns the caller's revenue workspace mapping and preflight health, creating the local-mode workspace on first touch.",
    "Returns this workspace's sending setup, and creates a local workspace the first time.",
  ],
  ["Policy facade unavailable; the link fails closed.", "The sending check is unavailable, so the link is not saved."],
  [
    "Receives arbitrary normalized webhook events, verified via X-Webhook-Signature HMAC over X-Webhook-Timestamp plus the raw body using WEBHOOK_SIGNING_SECRET. The Unix timestamp must be within five minutes of the server clock to prevent replay. The request names the owning userId; source defaults to webhook and may be mcp, github, linear, or stripe for connector/provider gateways. Payload is sealed, and routing uses the same cloud event router as provider webhooks.",
    "Receives a signed event from a connected service. The signature and time are checked, and the contents are stored.",
  ],
];

function presentReferenceProse(value: string): string {
  let prose = value
    .replaceAll("Stable UUID primary key.", "Id.")
    .replaceAll("Row creation timestamp.", "When this was created.")
    .replaceAll("Last row update timestamp.", "When this was last updated.")
    .replaceAll("Temporal workflow id", "Workflow id")
    .replaceAll("Temporal run id", "Run id")
    .replaceAll("Last mirrored Temporal status", "Last scheduler status")
    .replaceAll("Temporal close timestamp", "When the run finished")
    .replaceAll("Temporal start timestamp", "When the run started")
    .replaceAll("rather than Temporal directly", "rather than the scheduler directly")
    .replaceAll("Task mirror payload.", "Background task.")
    .replaceAll("Created task mirror.", "Saved background task.")
    .replaceAll("Updated task mirror.", "Updated background task.")
    .replaceAll("Task mirror and child rows deleted.", "Background task deleted.")
    .replaceAll("Task mirror.", "Background task.")
    .replaceAll("Run mirror payload.", "Run.")
    .replaceAll("Created run mirror.", "Recorded run.")
    .replaceAll("Updated run mirror.", "Updated run.")
    .replaceAll("Queued or started run mirror.", "Queued or started run.")
    .replaceAll("Run mirror.", "Run.")
    .replaceAll(
      "Server-readable mirror of one desktop background task spec. Owned by a user and keyed by slug per user.",
      "One background task. It belongs to one person.",
    )
    .replaceAll(
      "Markdown artifact mirror for bg-tasks/<slug>/index.md.",
      "The note for this workflow.",
    )
    .replaceAll(
      "Creates or revision-checks an artifact mirror update. Omit revision or send 0 when creating a missing artifact.",
      "Saves an update to the workflow note. Leave the revision empty, or send 0, when creating a missing note.",
    )
    .replaceAll(
      "Creates or first-syncs a desktop background task into the cloud mirror.",
      "Saves a background task from the desktop.",
    )
    .replaceAll(
      "Revision-checked partial update for the task mirror. Omitted fields are left unchanged; triggers:null clears the trigger JSON.",
      "Updates part of a background task. Omitted fields stay as they are. Sending an empty trigger clears it.",
    )
    .replaceAll(
      "Creates a run mirror for a desktop execution. Remote/manual queue creation usually uses POST /trigger instead.",
      "Records a desktop run. Queue a new run with the start endpoint instead.",
    )
    .replaceAll("One event to append to a run log mirror.", "One event to add to a run.")
    .replaceAll(
      "Local mirror of a WorkOS identity. Upserted when a verified bearer token is first seen.",
      "The signed-in person, saved when they first sign in.",
    )
    .replaceAll(
      "Background task instructions mirrored from task.yaml.",
      "Instructions for this background task.",
    )
    .replaceAll(
      "Last desktop or remote-trigger run id mirrored for this task.",
      "Id of the latest run for this task.",
    )
    .replaceAll(
      "Task trigger configuration mirrored from the desktop task.yaml. Common shapes include cron schedules, window schedules, or event subscriptions. Null clears the mirrored trigger config on PATCH.",
      "When this task starts. That can be a schedule or an incoming event. An empty value clears it.",
    )
    .replaceAll("Server timestamp for the last mirrored task update.", "When this task was last updated.")
    .replaceAll("Task instructions mirrored from task.yaml.", "Instructions for this task.")
    .replaceAll("Mirrored background tasks visible to this user.", "Background tasks for this person.")
    .replaceAll(
      "Mirrored run state for one desktop background task execution or queued remote trigger.",
      "One background run, including a run waiting to start.",
    )
    .replaceAll("Run error mirrored from the desktop.", "Error from the desktop run.")
    .replaceAll("Run summary mirrored from the desktop.", "Summary from the desktop run.")
    .replaceAll(
      "Where this task executes. desktop preserves the local-first path; api dispatches to the Temporal-backed API worker.",
      "Where this task runs. Desktop keeps it on this computer. Cloud runs it in Oppulence.",
    )
    .replaceAll(
      "Server-owned Temporal schedule reconciliation state.",
      "Whether the schedule is in sync.",
    )
    .replaceAll("Timestamp when Temporal execution closed.", "When the run finished.")
    .replaceAll("Timestamp when Temporal execution started.", "When the run started.")
    .replaceAll(
      "Control signal sent to a Temporal-backed API-worker run.",
      "Pause, resume, or update sent to a cloud run.",
    )
    .replaceAll("Background task artifact mirrors owned by the user.", "Workflow notes for this person.")
    .replaceAll("Background task run event mirrors owned by the user.", "Run events for this person.")
    .replaceAll("Background task run mirrors owned by the user.", "Runs for this person.")
    .replaceAll("Background task mirrors owned by the user.", "Background tasks for this person.")
    .replaceAll("Mirrored JSONL event from a background task run log.", "One event from a background run.")
    .replaceAll(
      "Zero-based sequence number for a mirrored JSONL run event.",
      "Event number, starting at zero.",
    )
    .replaceAll(
      "Revision-checked update for mirrored run state.",
      "Updates a run. Send the current revision.",
    )
    .replaceAll(
      "Minimal org-scoped entity spine projection. Raw note bodies and mirrored payloads are forbidden.",
      "A short record for this organization. Note bodies are not included.",
    )
    .replaceAll("Solomon AI API", "Oppulence API")
    .replaceAll("Solomon AI", "Oppulence")
    .replaceAll("authenticated Rowboat user", "signed-in person")
    .replaceAll("explicit Rowboat handoff", "workspace handoff")
    .replaceAll("a Rowboat user", "a signed-in person")
    .replaceAll("Rowboat user id", "User id")
    .replaceAll("Rowboat tenant", "Oppulence workspace")
    .replaceAll("Rowboat", "Oppulence")
    .replaceAll("OutboundConsole organization id", "Sending organization id")
    .replaceAll("OutboundConsole workspace id", "Sending workspace id")
    .replaceAll("OutboundConsole identifiers", "Sending workspace identifiers")
    .replaceAll("OutboundConsole workspace", "sending workspace")
    .replaceAll("OutboundConsole preflight", "sending check")
    .replaceAll("OutboundConsole", "checked sending")
    .replaceAll("policy preflight", "sending check")
    .replaceAll("policy facade", "sending check");
  // These sentences survive the phrase pass above. They are the field notes a
  // person still reads, so they are replaced whole rather than word by word.
  for (const [from, to] of API_REFERENCE_FIELD_NOTES) {
    prose = prose.replaceAll(from, to);
  }
  return prose
    .replaceAll("rowboat-api", "Oppulence")
    .replace(/RFC \d{1,3}\b/g, "")
    .replace(/\( /g, "(")
    .replace(/\(\)/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/ \./g, ".")
    .trim();
}

/**
 * Field descriptions live on schemas, request bodies, and responses. Parameter
 * descriptions stay as published so a path parameter does not change under a
 * generated client.
 */
function presentDescriptions(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) presentDescriptions(item);
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.description === "string") {
    const values = record.enum;
    if (
      record.description === GENERIC_STATUS_DESCRIPTION &&
      Array.isArray(values) &&
      values.length > 0 &&
      values.every((value) => typeof value === "string") &&
      typeof record.example === "string"
    ) {
      record.example = statusSample(values, record.example);
    }
    record.description = presentReferenceProse(record.description);
  }
  // Sample values render beside the field. Identifiers such as rowboat-desktop
  // do not match these phrases and stay as the API published them.
  if (typeof record.example === "string") {
    record.example = presentReferenceProse(record.example);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "description" || key === "parameters") continue;
    presentDescriptions(value);
  }
}

export function presentApiReferenceDocument<T>(spec: T): T {
  if (!spec || typeof spec !== "object") return spec;
  const document = structuredClone(spec) as ApiReferenceDocument;
  document.info = {
    ...document.info,
    title: API_REFERENCE_TITLE,
    description: API_REFERENCE_DESCRIPTION,
  };
  // The published spec also offers a local cluster address and a link to the
  // kind workflow. Neither belongs on the reference a person opens from the app.
  document.servers = (document.servers ?? []).filter(
    (server) => server.description !== "Local kind API",
  );
  for (const server of document.servers) {
    if (server.description === "Current Solomon AI API origin") {
      server.description = "Current Oppulence API origin";
    }
  }
  delete document.externalDocs;
  document.tags = document.tags?.map((tag) => {
    const copy = tag.name ? API_REFERENCE_TAGS[tag.name] : undefined;
    return copy ? { ...tag, name: copy.name, description: copy.description } : tag;
  });
  for (const path of Object.values(document.paths ?? {})) {
    if (!path || typeof path !== "object") continue;
    for (const [method, operation] of Object.entries(path)) {
      if (!HTTP_METHODS.has(method) || !operation) continue;
      if (operation.tags) operation.tags = operation.tags.map(presentedTagName);
      const storedSummary = operation.summary;
      if (operation.summary) {
        operation.summary =
          API_REFERENCE_SUMMARIES[operation.summary] ?? presentReferenceProse(operation.summary);
      }
      if (operation.description) {
        operation.description =
          (storedSummary && API_REFERENCE_DESCRIPTIONS[storedSummary]) ||
          presentReferenceProse(operation.description);
      }
    }
  }
  presentDescriptions(document);
  return document as T;
}

export function renderApiReferencePage(spec: unknown): string {
  const payload = JSON.stringify(spec ?? null).replaceAll("<", "\\u003c");
  // The viewer is served from this app. Loading it from unpkg would require
  // opening script-src to every package on that host, and Scalar's default
  // fonts are fetched from fonts.scalar.com, which the page policy blocks.
  const viewer = spec
    ? `<script src="/api/reference/viewer"></script>
    <script>
      Scalar.createApiReference("#app", {
        content: document.getElementById("api-reference-spec").textContent,
        withDefaultFonts: false,
        showDeveloperTools: "never",
        hideClientButton: true,
        agent: { disabled: true },
        mcp: { disabled: true },
      });
    </script>`
    : `<p style="font: 14px/1.5 sans-serif; margin: 24px;">The API reference could not be loaded.</p>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <title>Oppulence API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script id="api-reference-spec" type="application/json">${payload}</script>
    ${viewer}
  </body>
</html>`;
}
