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

  it("samples the execution a company graph marks needs reconcile", () => {
    const presented = presentApiReferenceDocument(spec);
    const status = presented.components.schemas.RelationshipGraphNode.properties.executionStatus;
    expect(status).toMatchObject({
      description: "Needs reconcile when this execution is ambiguous.",
      example: "ambiguous",
    });
    expect(presented.components.schemas.RevenueAction.properties.executionStatus.example).toBe(
      "pending",
    );
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
    const linked = presentApiReferenceDocument({
      components: {
        schemas: {
          RevenueWorkspace: {
            description:
              "Mapping between the Oppulence workspace and the canonical sending workspace. Local mode has no link: observation and draft-only execution work while preflight and sends stay disabled.",
          },
        },
      },
    });
    const sending = linked.components.schemas.RevenueWorkspace.description;
    expect(sending).toBe(
      "Mapping between the Oppulence workspace and the sending workspace. Without a link, sending stays off. A draft can land only after Gmail is connected.",
    );
    expect(sending).not.toContain("drafts still work");
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

    const billing = presentApiReferenceDocument(spec);
    expect(billing.components.schemas.BillingState.properties.status).toMatchObject({
      description: "Trial means this plan is still in its trial.",
      example: "trialing",
    });
    expect(
      billing.paths["/v1/me"]?.get?.responses?.["200"]?.content?.["application/json"]?.example?.billing,
    ).toMatchObject({
      status: "trialing",
      trialExpiresAt: "2026-07-01T00:00:00.000Z",
    });
    expect(billing.components.schemas.Subscription.properties.status.example).toBe("active");
    expect(billing.components.schemas.BackgroundTaskRun.properties.status.example).toBe("succeeded");
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

  it("does not sample openai for a workflow template provider", () => {
    const presented = presentApiReferenceDocument(spec);
    const template = presented.components.schemas.BackgroundTaskTemplate.properties.provider;
    expect(template.description).toBe("Default provider for tasks created from this template.");
    expect(template.example).toBe("openrouter");
    const request =
      presented.components.schemas.BackgroundTaskTemplateInstantiateRequest.properties.provider;
    expect(request.description).toBe("Provider override.");
    expect(request.example).toBe("openrouter");
    const task = presented.components.schemas.BackgroundTask.properties.provider;
    expect(task.example).toBe("openai");
  });

  it("does not sample a chat model for an embeddings request", () => {
    const presented = presentApiReferenceDocument(spec);
    const embedding = presented.components.schemas.LLMEmbeddingsRequest.properties.model;
    expect(embedding.description).toBe("Desktop-facing embedding model id.");
    expect(embedding.example).toBe("openai/text-embedding-3-small");
    const chat = presented.components.schemas.LLMChatCompletionsRequest.properties.model;
    expect(chat.example).toBe("openai/gpt-4.1-mini");
  });

  it("does not sample a UUID for an id that is not a UUID", () => {
    const presented = presentApiReferenceDocument(spec);
    const model = presented.components.schemas.LLMModel.properties.id;
    expect(model.description).toBe("Model id accepted by the model gateway.");
    expect(model.example).toBe("openai/gpt-4.1-mini");
    const edge = presented.components.schemas.RelationshipGraphEdge.properties.id;
    expect(edge.description).toBe("Stable edge id.");
    expect(edge.example).toBe("edge:ab12cd34");
    const record = presented.components.schemas.HubSpotSearchObject.properties.id;
    expect(record.description).toBe("HubSpot record id.");
    expect(record.example).toBe("101");
    const connector = presented.components.schemas.ConsentConnectorIdentity.properties.id;
    expect(connector.description).toBe("Connection name.");
    expect(connector.example).toBe("canvas");
    const task = presented.components.schemas.BackgroundTask.properties.id;
    expect(task.description).toBe("Id.");
    expect(task.example).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("does not sample a chat default for a workflow template model", () => {
    const presented = presentApiReferenceDocument(spec);
    const template = presented.components.schemas.BackgroundTaskTemplate.properties.model;
    expect(template.description).toBe("Default model id for runs.");
    expect(template.example).toBe("anthropic/claude-sonnet-4-5");
    const request =
      presented.components.schemas.BackgroundTaskTemplateInstantiateRequest.properties.model;
    expect(request.description).toBe("Model override.");
    expect(request.example).toBe("anthropic/claude-sonnet-4-5");
    const chat = presented.components.schemas.LLMChatCompletionsRequest.properties.model;
    expect(chat.example).toBe("openai/gpt-4.1-mini");
  });

  it("does not sample a model provider for a sign-in connection", () => {
    const presented = presentApiReferenceDocument(spec);
    const pending = presented.components.schemas.OAuthPending.properties.provider;
    expect(pending.description).toBe(
      "Sign-in service for this handoff. google, canvas, corinthian, or wispr.",
    );
    expect(pending.example).toBe("google");
    const connection = presented.components.schemas.OAuthConnection.properties.provider;
    expect(connection.description).toBe("Sign-in service for this connection.");
    expect(connection.example).toBe("google");
    const history = presented.components.schemas.OAuthConnectionHistory.properties.provider;
    expect(history.description).toBe("Sign-in service recorded for this connection.");
    expect(history.example).toBe("google");
    const task = presented.components.schemas.BackgroundTask.properties.provider;
    expect(task.example).toBe("openai");
    expect(task.description).toBe(
      "Which service this uses. That can be a sign-in service, a model provider, or where the work runs.",
    );
  });

  it("does not sample a model provider for an identity", () => {
    const presented = presentApiReferenceDocument(spec);
    const description =
      "Tool this identity came from. For an external record it is the first part of that record, such as hubspot.";
    const person = presented.components.schemas.PersonIdentity.properties.provider;
    expect(person.description).toBe(description);
    expect(person.example).toBe("hubspot");
    const relationship = presented.components.schemas.RelationshipIdentity.properties.provider;
    expect(relationship.description).toBe(description);
    expect(relationship.example).toBe("hubspot");
    const task = presented.components.schemas.BackgroundTask.properties.provider;
    expect(task.example).toBe("openai");
  });

  it("does not sample the catalog audience for a minted token", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: string; description?: string; nullable?: boolean }> }
    >;
    const token = schemas.MCPTokenResponse?.properties?.audience;
    expect(token?.example).toBe("mcp:canvas");
    expect(token?.description).toBe("Exact product resource-server audience.");
    const request = schemas.MCPTokenRequest?.properties?.audience;
    expect(request?.example).toBe("mcp:canvas");
    expect(request?.nullable).toBe(true);
    expect(schemas.Connector?.properties?.audience?.example).toBe("canvas-api");
  });

  it("does not sample a timestamp string for a unix token expiry", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown; description?: string }> }
    >;
    const token = schemas.MCPTokenResponse?.properties?.expires_at;
    expect(token?.example).toBe(1790784000);
    expect(token?.description).toBe("Unix expiry timestamp in seconds.");
    expect(schemas.OAuthTokenBundle?.properties?.expires_at?.example).toBe(1790784000);
    expect(schemas.WorkOSTokenBundle?.properties?.expires_at?.example).toBe(1790784000);
    expect(schemas.ConnectionStartResponse?.properties?.expires_at?.example).toBe("2026-06-04T20:48:00Z");
  });

  it("does not sample invoice scopes for a Google account", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown; description?: string }> }
    >;
    const google = schemas.GoogleConnectionAccount?.properties?.scopes;
    expect(google?.description).toBe("Granted Google OAuth scopes.");
    expect(google?.example).toEqual(["https://www.googleapis.com/auth/gmail.readonly"]);
    expect(schemas.SlackWorkspace?.properties?.scopes?.example).toEqual(["channels:history", "chat:write"]);
    expect(schemas.VoiceAPIKey?.properties?.scopes?.example).toEqual(["notes:read"]);
    expect(schemas.MCPTokenResponse?.properties?.scopes?.example).toEqual(["canvas:invoices.read"]);
    expect(schemas.PreConsentResponse?.properties?.scopes?.example).toEqual([
      {
        name: "canvas:invoices.read",
        display_name: "Read invoices",
        description: "Read invoice records.",
        tier: "low",
        required: true,
        requires_step_up: false,
      },
    ]);
  });

  it("does not sample a metered request for consent context", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown; description?: string; $ref?: string }> }
    >;
    const requestId = schemas.PreConsentResponse?.properties?.request_id;
    expect(requestId?.example).toBe("ctx_01HABCDEF");
    expect(requestId?.description).toBe("Deterministic context request id bound to the challenge.");
    expect(schemas.PreConsentResponse?.properties?.connector).toEqual({
      $ref: "#/components/schemas/ConsentConnectorIdentity",
    });
    expect(schemas.CreditLedger?.properties?.request_id?.example).toBe("9e2fb15a-936d-4f39-9372-73cfe0476ca8");
  });

  it("does not describe a voice key as a connector credential", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown; description?: string; nullable?: boolean }> }
    >;
    const lastUsed = schemas.VoiceAPIKey?.properties?.last_used_at;
    expect(lastUsed?.description).toBe("Last-use time.");
    expect(lastUsed?.example).toBe("2026-08-21T23:00:00Z");
    expect(lastUsed?.nullable).toBe(true);
    const expires = schemas.VoiceAPIKey?.properties?.expires_at;
    expect(expires?.description).toBe("Expiry time.");
    expect(expires?.example).toBe("2026-09-20T23:00:00Z");
    expect(schemas.MCPConnection?.properties?.last_used_at?.description).toBe(
      "Timestamp when the connector credential was last minted or used.",
    );
  });

  it("does not sample a ledger time for a Slack message", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown; description?: string; nullable?: boolean }> }
    >;
    const ts = schemas.SlackThreadMessage?.properties?.ts;
    expect(ts?.description).toBe("Slack message timestamp.");
    expect(ts?.example).toBe("1700000000.000100");
    expect(ts?.nullable).toBe(true);
    expect(schemas.SlackThreadMessage?.properties?.user?.description).toBe("Slack user id when present.");
    expect(schemas.CreditLedger?.properties?.ts?.example).toBe("2026-06-04T20:38:00Z");
  });

  it("does not describe a session total as one model request", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown; description?: string }> }
    >;
    expect(schemas.AgentSession?.properties?.cost_units?.description).toBe(
      "Credits used across this session.",
    );
    expect(schemas.AgentSession?.properties?.cost_units?.example).toBe(8);
    expect(schemas.AgentTurn?.properties?.cost_units?.description).toBe(
      "Credits used during this turn.",
    );
    expect(schemas.LLMUsage?.properties?.cost_units?.description).toBe(
      "Settled credit cost for the request.",
    );
  });

  it("does not sample this run id as the previous run", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      { properties?: Record<string, { example?: unknown }> }
    >;
    const run = schemas.BackgroundTaskRun?.properties;
    expect(run?.previousRunId?.example).toBe("run-20260604-205000");
    expect(run?.runId?.example).toBe("run-20260604-210000");
    expect(schemas.BackgroundTaskRunCreateRequest?.properties?.previousRunId?.example).toBe(
      "run-20260604-205000",
    );
  });

  it("does not sample one commitment as both ends of a dependency", () => {
    const presented = presentApiReferenceDocument(spec);
    const dependency = (
      presented.components.schemas as Record<
        string,
        { properties?: Record<string, { example?: unknown }> }
      >
    ).CommitmentDependency?.properties;
    expect(dependency?.fromCommitmentId?.example).toBe("8b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(dependency?.toCommitmentId?.example).toBe("26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51");
    expect(dependency?.relationshipId?.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(dependency?.dependencyId?.example).toBe("3b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("does not show the whole voice key as its display prefix", () => {
    const presented = presentApiReferenceDocument(spec);
    const key = (
      presented.components.schemas as Record<
        string,
        { properties?: Record<string, { example?: unknown; description?: string }> }
      >
    ).VoiceAPIKey?.properties;
    expect(key?.key_prefix?.example).toBe("opv_live_example");
    expect(key?.key_prefix?.description).toBe("First 16 characters of the secret. Safe to display.");
    expect(key?.key?.example).toBe("opv_live_exampleAbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
    expect(key?.key?.example).not.toBe(key?.key_prefix?.example);
  });

  it("does not sample the relationship as the attention owner", () => {
    const presented = presentApiReferenceDocument(spec);
    const item = (
      presented.components.schemas as Record<
        string,
        { properties?: Record<string, { example?: unknown; description?: string }> }
      >
    ).RelationshipAttentionItem?.properties;
    expect(item?.ownerId?.description).toBe("Assigned user id.");
    expect(item?.ownerId?.example).toBe("a8dfa9b6-a7b2-46ea-982c-622a914c00e5");
    expect(item?.relationshipId?.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(item?.acknowledgedBy?.example).toBeUndefined();
    expect(item?.dismissedBy?.example).toBeUndefined();
    expect(item?.dismissedBy?.description).toBe(
      "User who dismissed this item. Empty until it is dismissed.",
    );
  });

  it("does not sample the relationship id for the user who decided", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas;
    const userId = "a8dfa9b6-a7b2-46ea-982c-622a914c00e5";
    const relationshipId = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(schemas.RelationshipIdentityDecision.properties.actorId).toMatchObject({
      description: "User who made this decision.",
      example: userId,
    });
    expect(schemas.RelationshipIdentityLineage.properties.actorId).toMatchObject({
      description: "User who recorded this change.",
      example: userId,
    });
    expect(schemas.RelationshipIdentityCandidate.properties.decisionActorId).toMatchObject({
      description: "User who resolved this review.",
      example: userId,
    });
    expect(schemas.RelationshipSourceStatus.properties.consentingActorId).toMatchObject({
      description: "User who connected this source.",
      example: userId,
    });
    expect(schemas.MissionControlDimensionEvidence.properties.reviewerId).toMatchObject({
      description: "User who reviewed this value.",
      example: userId,
    });
    expect(schemas.RelationshipAttentionItem.properties.relationshipId.example).toBe(relationshipId);
  });

  it("does not sample the source row as the history row", () => {
    const presented = presentApiReferenceDocument(spec);
    const history = presented.components.schemas.UserHistory.properties;
    expect(history.id).toMatchObject({
      description: "Id of this history row.",
      example: "223e4567-e89b-12d3-a456-426614174000",
    });
    expect(history.ref).toMatchObject({
      description: "UUID of the source row represented by a history row.",
      example: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(presented.components.schemas.User.properties.id.example).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });

  it("does not sample the promise owner as the person who recorded the change", () => {
    const presented = presentApiReferenceDocument(spec);
    const event = presented.components.schemas.CommitmentEvent.properties;
    expect(event.actorRef).toMatchObject({
      description: "User who recorded this change.",
      example: "a8dfa9b6-a7b2-46ea-982c-622a914c00e5",
    });
    expect(event.ownerParticipantRef.example).toBe("alex@example.com");
    expect(event.counterpartyParticipantRef.example).toBe("jordan@example.com");
    expect(event.beneficiaryParticipantRef.example).toBe("customer:acme");
    expect(presented.components.schemas.RelationshipCommitment.properties.ownerParticipantRef.example).toBe(
      "alex@example.com",
    );
  });

  it("does not point a graph edge at commitment:1", () => {
    const presented = presentApiReferenceDocument(spec);
    const edge = presented.components.schemas.RelationshipGraphEdge.properties;
    expect(edge.source).toMatchObject({
      description: "Source node id.",
      example: "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    expect(edge.target).toMatchObject({
      description: "Target node id.",
      example: "commitment:26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51",
    });
  });

  it("does not select relationship:123 on a saved graph view", () => {
    const presented = presentApiReferenceDocument(spec);
    const state = presented.components.schemas.ConsoleGraphSavedViewState.properties;
    expect(state.selectedNodeId).toMatchObject({
      description: "Optional selected graph node.",
      example: "relationship:3a196c5e-b10e-46cb-a177-7c001f7be573",
    });
    expect(state.relationshipId.example).toBe("3a196c5e-b10e-46cb-a177-7c001f7be573");
  });

  it("does not open an attention item from commitment:123", () => {
    const presented = presentApiReferenceDocument(spec);
    const item = presented.components.schemas.RelationshipAttentionItem.properties;
    expect(item.triggeringObjectRef).toMatchObject({
      description: "Triggering object.",
      example: "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    expect(item.reasonCode.example).toBe("overdue_commitment");
  });

  it("records a merge with the two relationship ids", () => {
    const presented = presentApiReferenceDocument(spec);
    const lineage = presented.components.schemas.RelationshipIdentityLineage.properties;
    expect(lineage.beforeRelationshipIds).toMatchObject({
      description: "Relationship ids before.",
      example: [
        "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
        "3a196c5e-b10e-46cb-a177-7c001f7be573",
      ],
    });
    expect(lineage.afterRelationshipIds).toMatchObject({
      description: "Relationship ids after.",
      example: ["3a196c5e-b10e-46cb-a177-7c001f7be573"],
    });
    expect(JSON.stringify(lineage.beforeRelationshipIds)).not.toContain("relationship:1");
    expect(JSON.stringify(lineage.afterRelationshipIds)).not.toContain("relationship:2");
  });

  it("names the assertion a snapshot selected", () => {
    const presented = presentApiReferenceDocument(spec);
    const snapshot = presented.components.schemas.RelationshipStateSnapshot.properties;
    expect(snapshot.assertionIds).toMatchObject({
      description: "Assertions selected by deterministic precedence.",
      example: ["7b8dfa9b-a7b2-46ea-982c-622a914c00e5"],
    });
    expect(snapshot.assertionIds.items.example).toBe("7b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(JSON.stringify(snapshot.assertionIds)).not.toContain("assertion-123");
    expect(snapshot.id.example).not.toBe("7b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("says the reference could not be loaded when the spec is missing", () => {
    const page = renderApiReferencePage(null);
    expect(page).toContain("The API reference could not be loaded.");
    expect(page).not.toContain("unpkg.com");
  });

  it("names the status values listed on the field", () => {
    const presented = presentApiReferenceDocument(spec);
    const workspace =
      presented.components.schemas.RevenueWorkspace.properties.status.description;
    expect(workspace).toBe("Active, disconnected, or needs repair.");
    expect(workspace).not.toContain("billing");
    expect(workspace).not.toContain("Background runs");
    expect(
      presented.components.schemas.BackgroundTaskRunStatusResponse.properties.status.description,
    ).toBe("Queued, running, succeeded, failed, or stopped.");
    expect(presented.components.schemas.BillingState.properties.status.description).toBe(
      "Active, trialing, past due, or canceled.",
    );
    const member =
      presented.components.schemas.RevenueWorkspaceMember.properties.status.description;
    expect(member).toBe("Status for this record.");
    expect(member).not.toContain("Plans use billing");
  });

  it("names the operation values when the sample is not one of them", () => {
    const presented = presentApiReferenceDocument(spec);
    const voice = presented.components.schemas.VoiceSyncMutation.properties.operation;
    expect(voice.description).toBe("Saved or deleted.");
    expect(voice.description).not.toContain("history");
    expect(voice.example).toBe("upsert");
    const history = presented.components.schemas.UserHistory.properties.operation;
    expect(history.description).toBe("Mutation operation that produced this history row.");
    expect(history.example).toBe("UPDATE");
    const capture = presented.components.schemas.CaptureArtifact.properties.operation;
    expect(capture.description).toBe("What changed on this record.");
    expect(capture.example).toBeUndefined();
  });

  it("uses a status sample the field allows", () => {
    const presented = presentApiReferenceDocument(spec);
    const run = presented.components.schemas.BackgroundTaskRunStatusResponse.properties.status;
    expect(run.example).toBe("queued");
    expect(run.description).toContain("Background runs");
    expect(presented.components.schemas.HealthResponse.properties.status.example).toBe("ok");
    expect(presented.components.schemas.ReadyResponse.properties.status.example).toBe("ready");
    expect(presented.components.schemas.RevenueWorkspace.properties.status.example).toBe("active");
  });

  it("does not call an external record a history row", () => {
    const presented = presentApiReferenceDocument(spec);
    const ref = presented.components.schemas.EntityResourceRef.properties.ref;
    expect(ref.description).toBe("External record this row points at.");
    expect(ref.example).toBe("hubspot:company:acme");
    expect(ref.description).not.toContain("history");
    const history = presented.components.schemas.UserHistory.properties.ref;
    expect(history.description).toBe("UUID of the source row represented by a history row.");
    expect(history.example).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("does not describe a person removal as a credit-ledger reason", () => {
    const presented = presentApiReferenceDocument(spec);
    const removal = presented.components.schemas.PersonSuppression.properties.reason;
    expect(removal.description).toBe(
      "Why this person was removed. subject_request means they asked. user_action means the account holder removed them.",
    );
    expect(removal.enum).toEqual(["user_action", "subject_request"]);
    expect(removal.example).toBe("user_action");
    expect(removal.description).not.toContain("ledger");
    const transition = presented.components.schemas.CommitmentEvent.properties.reason;
    expect(transition.description).toBe("Transition rationale.");
    expect(transition.example).toBe("Counterparty accepted in writing.");
    expect(transition.enum).toBeUndefined();
    const ledger = presented.components.schemas.CreditLedger.properties.reason;
    expect(ledger.example).toBe("llm_settle");
    expect(ledger.enum).toContain("llm_settle");
  });

  it("does not call a relationship snapshot an OAuth ticket", () => {
    const presented = presentApiReferenceDocument(spec);
    const snapshot = presented.components.schemas.RelationshipStateSnapshot.properties.state;
    expect(snapshot.description).toBe("Projected state at this version.");
    expect(snapshot.type).toBe("object");
    expect(snapshot.example).toBeUndefined();
    const graph = presented.components.schemas.ConsoleGraphSavedViewPayload.properties.state;
    expect(graph.$ref).toBe("#/components/schemas/ConsoleGraphSavedViewState");
    expect(graph.description).toBeUndefined();
    expect(graph.example).toBeUndefined();
    const oauth = presented.components.schemas.OAuthPending.properties.state;
    expect(oauth.description).toBe("Opaque one-time OAuth state/session ticket.");
    expect(oauth.example).toBe("state_abc123");
  });

  it("does not describe a relationship change as a credit balance", () => {
    const presented = presentApiReferenceDocument(spec);
    const delta = presented.components.schemas.RelationshipIntelligence.properties.delta;
    expect(delta.description).toBe(
      "Exact before/after values, uncertain claim ids, contradictions, and recommendation reason.",
    );
    expect(delta.type).toBe("object");
    expect(delta.example).toBeUndefined();
    const ledger = presented.components.schemas.CreditLedger.properties.delta;
    expect(ledger.description).toContain("Credit delta.");
    expect(ledger.example).toBe(-42);
  });

  it("does not describe a mail thread as an LLM provider", () => {
    const presented = presentApiReferenceDocument(spec);
    const thread = presented.components.schemas.MailThread.properties.provider;
    expect(thread.description).toBe("Mailbox this row came from. Only Gmail is stored.");
    expect(thread.enum).toEqual(["gmail"]);
    expect(thread.example).toBe("gmail");
    const cache = presented.components.schemas.MailBodyCache.properties.provider;
    expect(cache.example).toBe("gmail");
    expect(cache.enum).toEqual(["gmail"]);
    const task = presented.components.schemas.BackgroundTask.properties.provider;
    expect(task.example).toBe("openai");
  });

  it("does not call a participant the signed-in person's email", () => {
    const presented = presentApiReferenceDocument(spec);
    const participant = presented.components.schemas.RelationshipParticipant.properties.email;
    expect(participant.description).toBe("Normalized email.");
    expect(participant.example).toBe("avery@acme.com");
    const message = presented.components.schemas.CommunicationParticipant.properties.email;
    expect(message.description).toBe("Address of someone on this message.");
    expect(message.example).toBe("avery@acme.com");
    const user = presented.components.schemas.User.properties.email;
    expect(user.description).toBe("Best-known WorkOS primary email for the user.");
    expect(user.example).toBe("user@example.com");
  });
});
