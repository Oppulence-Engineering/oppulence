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
      if (operation.summary) {
        operation.summary =
          API_REFERENCE_SUMMARIES[operation.summary] ?? presentReferenceProse(operation.summary);
      }
      if (operation.description) {
        operation.description = presentReferenceProse(operation.description);
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
