import { describe, expect, it } from "vitest";

import spec from "../../../rowboat-api/api/openapi.json";
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

  it("drops the local cluster link and names common fields", () => {
    const presented = presentApiReferenceDocument({
      externalDocs: {
        description: "Local kind deployment workflow",
        url: "https://github.com/Oppulence-Engineering/rowboat/blob/main/docs/LOCAL_KIND_ROWBOAT_API.md",
      },
      servers: [
        { url: "/", description: "Current Solomon AI API origin" },
        { url: "http://localhost:18080", description: "Local kind API" },
      ],
      components: {
        schemas: {
          User: {
            properties: {
              id: { description: "Stable UUID primary key." },
              created_at: { description: "Row creation timestamp." },
              updated_at: { description: "Last row update timestamp." },
              run_id: { description: "Temporal run id." },
            },
          },
        },
      },
    });

    expect(presented.externalDocs).toBeUndefined();
    expect(presented.servers).toEqual([{ url: "/", description: "Current Oppulence API origin" }]);
    const properties = presented.components.schemas.User.properties;
    expect(properties.id.description).toBe("Id.");
    expect(properties.created_at.description).toBe("When this was created.");
    expect(properties.updated_at.description).toBe("When this was last updated.");
    expect(properties.run_id.description).toBe("Run id.");
  });

  it("names background work without the scheduler's words", () => {
    const presented = presentApiReferenceDocument(spec);
    const lines: string[] = [];
    for (const [path, item] of Object.entries(presented.paths ?? {})) {
      if (!path.includes("background-task")) continue;
      for (const [method, operation] of Object.entries(item)) {
        if (!operation || typeof operation !== "object" || !("summary" in operation)) continue;
        if (method === "parameters") continue;
        lines.push(`${operation.summary ?? ""}\n${operation.description ?? ""}`);
      }
    }
    const text = lines.join("\n");
    expect(text).toContain("Install maintained workflows");
    expect(text).toContain("Installs or updates the maintained workflows for the signed-in person.");
    expect(text).toContain("Cancel a cloud run");
    expect(text).not.toMatch(/Temporal|task\.yaml|API-worker|API-target|\bmirror\b|Instantiate|ndjson/);
    expect(presented.components.schemas.BackgroundTask.description).toBe(
      "One background task. It belongs to one person.",
    );
    expect(presented.components.schemas.User.description).toBe(
      "The signed-in person, saved when they first sign in.",
    );
    const descriptions: string[] = [];
    const collect = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      const record = node as { description?: unknown };
      if (typeof record.description === "string") descriptions.push(record.description);
      Object.values(record).forEach(collect);
    };
    collect(presented);
    expect(descriptions.join("\n")).not.toMatch(/mirror|Temporal|task\.yaml/i);
    const readable: string[] = [];
    const collectReadable = (node: unknown, key?: string) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((item) => collectReadable(item));
        return;
      }
      const record = node as Record<string, unknown>;
      if (key !== "parameters" && typeof record.description === "string") {
        readable.push(record.description);
      }
      if (key !== "parameters" && typeof record.summary === "string") {
        readable.push(record.summary);
      }
      for (const [childKey, child] of Object.entries(record)) {
        if (childKey === "parameters") continue;
        collectReadable(child, childKey);
      }
    };
    collectReadable(presented);
    expect(readable.join("\n")).not.toMatch(
      /rowboat-api|\bslug\b|artifact|API-worker|bg-tasks|JSONL|\bpreflight\b|\bfacade\b|solomon-ai:|x-solomon/i,
    );
  });

  it("names the observation a commitment event recorded", () => {
    const presented = presentApiReferenceDocument(spec);
    const event = presented.components.schemas.CommitmentEvent.properties;
    const observationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(event.sourceObservationId).toMatchObject({
      description: "Source observation id.",
      example: observationID,
    });
    expect(event.evidenceRefs).toMatchObject({
      description: "Exact evidence references.",
      example: [`relationship-observation:${observationID}`],
    });
    expect(JSON.stringify(event.sourceObservationId)).not.toContain("relationship-observation:ab12");
    expect(presented.components.schemas.MissionControlEvidenceReference.properties.observationId.example).toBe(
      observationID,
    );
  });

  it("samples the approved revision Approve stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/approve"].post;
    expect(operation.summary).toBe("Approve");
    expect(operation.operationId).toBe("approveRevenueAction");
    expect(operation.requestBody.content["application/json"].example).toEqual({ acceptRisk: false });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      approvalStatus: "approved",
      approvedRevision: 1,
      approvedAt: "2026-07-12T12:05:00Z",
      queueStatus: "open",
      executionStatus: "pending",
      executionMode: "draft",
    });
    expect(operation.responses["200"].content["application/json"].example.executedAt).toBeUndefined();
    expect(presented.components.schemas.RevenueAction.properties.approvalStatus.example).toBe("pending");
  });

  it("says the reference could not be loaded when the spec is missing", () => {
    const page = renderApiReferencePage(null);
    expect(page).toContain("The API reference could not be loaded.");
    expect(page).not.toContain("unpkg.com");
  });
});
