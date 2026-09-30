/**
 * The product opens this reference from Help and the sidebar. The API process
 * still publishes the document as "Solomon AI", including its HTML page. We
 * keep the spec and replace only the heading a person reads first, and we
 * render that page ourselves so the app never executes the upstream HTML.
 */
export const API_REFERENCE_TITLE = "Oppulence API";

export const API_REFERENCE_DESCRIPTION =
  "Oppulence API for sign-in, billing, workflows, companies, people, and promises.";

type ApiReferenceDocument = {
  info?: { title?: string; description?: string };
  servers?: Array<{ description?: string }>;
};

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
