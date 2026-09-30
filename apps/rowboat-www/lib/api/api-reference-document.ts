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
    description: "API keys, capture sync, and saved artifacts for this workspace.",
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
function presentReferenceProse(value: string): string {
  return value
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
    .replaceAll("policy facade", "sending check")
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
