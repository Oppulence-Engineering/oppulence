import { describe, expect, it } from "vitest";

import {
  presentApiReferenceDocument,
  renderApiReferencePage,
} from "@/lib/api/api-reference-document";

describe("API reference document", () => {
  it("replaces the Solomon heading and names schema text for the product", () => {
    const presented = presentApiReferenceDocument({
      openapi: "3.0.3",
      info: {
        title: "Solomon AI API",
        version: "0.1.0",
        description: "Solomon AI's desktop API. The API brokers WorkOS sign-in.",
      },
      servers: [{ url: "/", description: "Current Solomon AI API origin" }],
      components: {
        schemas: {
          ErrorEnvelope: {
            description: "RFC 9457 problem details returned by Solomon AI API handlers.",
          },
        },
      },
    });

    expect(presented.info.title).toBe("Oppulence API");
    expect(presented.info.description).toBe(
      "Oppulence API for sign-in, billing, workflows, companies, people, and promises.",
    );
    expect(presented.info.version).toBe("0.1.0");
    expect(presented.servers[0]?.description).toBe("Current Oppulence API origin");
    expect(presented.components.schemas.ErrorEnvelope.description).toBe(
      "RFC 9457 problem details returned by Oppulence API handlers.",
    );
    expect(presented.components.schemas.ErrorEnvelope.description).not.toMatch(/Solomon/);
  });

  it("renders a page titled for Oppulence and escapes embedded markup", () => {
    const page = renderApiReferencePage({
      info: { title: "Oppulence API" },
      note: "</script><script>alert(1)</script>",
    });

    expect(page).toContain("<title>Oppulence API Reference</title>");
    expect(page).toContain('"title":"Oppulence API"');
    expect(page).not.toContain("</script><script>alert(1)</script>");
    expect(page).toContain("\\u003c/script>");
    expect(page).toContain('src="/api/reference/viewer"');
    expect(page).toContain("withDefaultFonts: false");
    expect(page).toContain('showDeveloperTools: "never"');
    expect(page).toContain("hideClientButton: true");
    expect(page).toContain("agent: { disabled: true }");
    expect(page).toContain("mcp: { disabled: true }");
    expect(page).not.toContain("unpkg.com");
    expect(page).not.toContain("fonts.scalar.com");
  });

  it("names reference sections in product language and keeps operations attached", () => {
    const presented = presentApiReferenceDocument({
      tags: [
        { name: "Revenue", description: "OutboundConsole policy preflight" },
        { name: "LLM", description: "Credit-gated OpenAI-compatible text" },
        { name: "Relationship Intelligence", description: "append-only evidence" },
        { name: "System", description: "Health, readiness, and generated documentation endpoints." },
      ],
      paths: {
        "/v1/chat": { post: { tags: ["LLM", "System"] } },
      },
    });

    expect(presented.tags.map((tag) => tag.name)).toEqual([
      "Promises",
      "Model calls",
      "Companies and people",
      "System",
    ]);
    expect(presented.tags[0]?.description).toBe(
      "Promises, approvals, and the check before a message is sent.",
    );
    expect(presented.tags[0]?.description).not.toMatch(/OutboundConsole|evidence/);
    expect(presented.tags[2]?.description).not.toMatch(/evidence|RFC/);
    expect(presented.tags[3]?.description).toBe(
      "Health, readiness, and generated documentation endpoints.",
    );
    expect(presented.paths["/v1/chat"]?.post?.tags).toEqual(["Model calls", "System"]);
  });

  it("renames operation titles and drops the old product from their text", () => {
    const presented = presentApiReferenceDocument({
      paths: {
        "/v1/revenue-workspaces/link": {
          post: {
            summary: "Link the OutboundConsole workspace",
            description:
              "Completes the OutboundConsole workspace link (RFC 030). Requires a configured policy facade.",
            tags: ["Revenue"],
          },
          parameters: [{ name: "slug", description: "Solomon AI API slug" }],
        },
      },
    });
    const operation = presented.paths["/v1/revenue-workspaces/link"]?.post;
    expect(operation?.summary).toBe("Link the sending workspace");
    expect(operation?.description).toBe(
      "Completes the sending workspace link. Requires a configured sending check.",
    );
    expect(operation?.description).not.toMatch(/Solomon|OutboundConsole|RFC/);
    expect(operation?.tags).toEqual(["Promises"]);
    expect(presented.paths["/v1/revenue-workspaces/link"]?.parameters?.[0]?.description).toContain(
      "Solomon AI API",
    );
  });

  it("names schema fields without the old product and keeps public standards", () => {
    const presented = presentApiReferenceDocument({
      components: {
        schemas: {
          RevenueWorkspace: {
            description:
              "Mapping between the Rowboat tenant and the canonical OutboundConsole workspace. Local mode has no link.",
            properties: {
              outboundOrganizationId: { description: "OutboundConsole organization id." },
              outboundWorkspaceId: { description: "OutboundConsole workspace id." },
              completedAt: { description: "When the deletion finished (RFC 3339)." },
              userId: { description: "Rowboat user id (UUID) owning the event." },
            },
          },
          RevenuePolicyDecision: {
            description:
              "Immutable OutboundConsole preflight decision for one exact action revision. Rowboat snapshots the decision; it never composes one.",
          },
          ErrorEnvelope: {
            description:
              "RFC 9457 problem details returned by Solomon AI API handlers. code, requestId, and traceId are extension members.",
          },
        },
      },
      paths: {
        "/v1/revenue-workspaces/link": {
          post: {
            requestBody: { description: "OutboundConsole identifiers." },
            responses: {
              "409": {
                description:
                  "The browser install is incomplete, or the workspace is already owned by another Rowboat account.",
              },
            },
          },
        },
        "/v1/webhooks/slack": {
          post: {
            description:
              "event_callback deliveries for workspaces mapped to a Rowboat user are ingested.",
          },
        },
      },
    });

    const schema = presented.components.schemas.RevenueWorkspace;
    expect(schema.description).toBe(
      "Mapping between the Oppulence workspace and the canonical sending workspace. Local mode has no link.",
    );
    expect(schema.properties.outboundOrganizationId.description).toBe("Sending organization id.");
    expect(schema.properties.outboundWorkspaceId.description).toBe("Sending workspace id.");
    expect(schema.properties.completedAt.description).toBe(
      "When the deletion finished (RFC 3339).",
    );
    expect(schema.properties.userId.description).toBe("User id (UUID) owning the event.");
    const samples = presentApiReferenceDocument({
      components: {
        schemas: {
          ConsentClientIdentity: {
            properties: { display_name: { example: "Rowboat Desktop" } },
          },
          VoiceTextToSpeechRequest: {
            properties: { text: { example: "Hello from Solomon AI." } },
          },
          PreConsentRequest: {
            properties: { hydra_client_id: { example: "rowboat-desktop" } },
          },
        },
      },
    }).components.schemas;
    expect(samples.ConsentClientIdentity.properties.display_name.example).toBe("Oppulence Desktop");
    expect(samples.VoiceTextToSpeechRequest.properties.text.example).toBe("Hello from Oppulence.");
    expect(samples.PreConsentRequest.properties.hydra_client_id.example).toBe("rowboat-desktop");
    expect(presented.components.schemas.RevenuePolicyDecision.description).toBe(
      "Immutable sending check decision for one exact action revision. Oppulence snapshots the decision; it never composes one.",
    );
    expect(presented.components.schemas.ErrorEnvelope.description).toContain("RFC 9457");
    expect(presented.components.schemas.ErrorEnvelope.description).not.toMatch(/Solomon/);
    expect(presented.paths["/v1/revenue-workspaces/link"]?.post?.requestBody?.description).toBe(
      "Sending workspace identifiers.",
    );
    expect(
      presented.paths["/v1/revenue-workspaces/link"]?.post?.responses?.["409"]?.description,
    ).toBe(
      "The browser install is incomplete, or the workspace is already owned by another Oppulence account.",
    );
    expect(presented.paths["/v1/webhooks/slack"]?.post?.description).toBe(
      "event_callback deliveries for workspaces mapped to a signed-in person are ingested.",
    );
  });

  it("says the reference could not be loaded when the spec is missing", () => {
    const page = renderApiReferencePage(null);
    expect(page).toContain("The API reference could not be loaded.");
    expect(page).not.toContain("unpkg.com");
  });
});
