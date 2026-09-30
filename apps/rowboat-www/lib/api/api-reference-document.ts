/**
 * The product opens this reference from Help and the sidebar. The API process
 * still publishes the document as "Solomon AI", including its HTML page. We
 * keep the spec and replace the heading and section names a person reads.
 * The viewer chrome that only exists on a developer machine — Ask AI, Generate
 * MCP, and Developer Tools — stays off, because this page is the product reference.
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
    name: "Models",
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

type ApiReferenceOperation = { tags?: string[] };

type ApiReferenceDocument = {
  info?: { title?: string; description?: string };
  servers?: Array<{ description?: string }>;
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, Record<string, ApiReferenceOperation | undefined>>;
};

function presentedTagName(name: string): string {
  return API_REFERENCE_TAGS[name]?.name ?? name;
}

export function presentApiReferenceDocument<T>(spec: T): T {
  if (!spec || typeof spec !== "object") return spec;
  const document = structuredClone(spec) as ApiReferenceDocument;
  document.info = {
    ...document.info,
    title: API_REFERENCE_TITLE,
    description: API_REFERENCE_DESCRIPTION,
  };
  for (const server of document.servers ?? []) {
    if (server.description === "Current Solomon AI API origin") {
      server.description = "Current Oppulence API origin";
    }
  }
  document.tags = document.tags?.map((tag) => {
    const copy = tag.name ? API_REFERENCE_TAGS[tag.name] : undefined;
    return copy ? { ...tag, name: copy.name, description: copy.description } : tag;
  });
  for (const path of Object.values(document.paths ?? {})) {
    if (!path || typeof path !== "object") continue;
    for (const operation of Object.values(path)) {
      if (!operation?.tags) continue;
      operation.tags = operation.tags.map(presentedTagName);
    }
  }
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
