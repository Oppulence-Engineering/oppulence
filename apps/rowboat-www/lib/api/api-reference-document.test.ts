import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import spec from "../../../rowboat-api/api/openapi.json";
import {
  presentApiReferenceDocument,
  renderApiReferencePage,
} from "@/lib/api/api-reference-document";

describe("API reference document", () => {
  it("samples the agent Save changes stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const agent = presented.paths["/v1/agents/{slug}"].put;
    expect(agent.summary).toBe("Save changes");
    expect(agent.operationId).toBe("putAgent");
    expect(agent.description).toBe(
      "Save changes stores this agent's name, purpose, model, and tools.",
    );
    expect(agent.parameters[0]).toMatchObject({
      name: "slug",
      example: "acme-follow-up",
    });
    expect(agent.requestBody.content["application/json"].example).toEqual({
      apiVersion: "agent.rowboat.dev/v1",
      kind: "Agent",
      metadata: { slug: "acme-follow-up", name: "Acme follow-up" },
      spec: {
        instructions: "Draft the next follow-up for Acme.",
        model: "openai/gpt-4.1-mini",
        provider: "openrouter",
        tools: ["relationship.read"],
      },
    });
    expect(agent.responses["200"].description).toBe("The agent is saved.");
    expect(agent.responses["201"].description).toBe("The agent was created.");
    expect(agent.responses["200"].content["application/json"].example).toEqual({
      slug: "acme-follow-up",
      name: "Acme follow-up",
      source: "tenant",
      instructions: "Draft the next follow-up for Acme.",
      model: "openai/gpt-4.1-mini",
      provider: "openrouter",
      enabledTools: ["relationship.read"],
    });
    const saved = JSON.stringify(agent.responses["200"]);
    expect(saved).not.toContain("acta_");
    expect(saved).not.toContain('"token"');
  });

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
    const scopes = presented.components.schemas.RelationshipSourceStatus.properties;
    expect(scopes.missingScopes.items.example).toBe("https://www.googleapis.com/auth/gmail.send");
    expect(scopes.grantedScopes.items.example).toBe(
      "https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(scopes.requiredScopes.items.example).toBe(
      "https://www.googleapis.com/auth/gmail.readonly",
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

  it("samples the sequence Show the next events sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const page = presented.components.schemas.BackgroundTaskRunEventsResponse;
    expect(page.properties.nextSeq).toMatchObject({
      description: "Last sequence on this page. Show the next events sends it as afterSeq.",
      example: 499,
      nullable: true,
      type: "integer",
    });
    expect(page.required).toEqual(["events"]);
    const listed =
      presented.paths["/v1/background-tasks/{slug}/runs/{runId}/events"].get.responses["200"]
        .content["application/json"].example;
    expect(listed.nextSeq).toBeUndefined();
    expect(JSON.stringify(page)).not.toContain("acta_");
    expect(JSON.stringify(page)).not.toContain('"token"');
  });

  it("samples the Attempt count an open run shows", () => {
    const presented = presentApiReferenceDocument(spec);
    const run = presented.components.schemas.BackgroundTaskRun;
    expect(run.properties.attempt).toMatchObject({
      description: "Attempt shown when this run is open.",
      example: 1,
      type: "integer",
    });
    expect(run.required).not.toContain("attempt");
    expect(JSON.stringify(run.properties.attempt)).not.toContain("acta_");
    expect(JSON.stringify(run.properties.attempt)).not.toContain('"token"');
  });

  it("names reference sections in product language and keeps operations attached", () => {
    const presented = presentApiReferenceDocument({
      tags: [
        { name: "Revenue", description: "OutboundConsole policy preflight" },
        { name: "LLM", description: "Credit-gated OpenAI-compatible text" },
        { name: "Relationship Intelligence", description: "append-only evidence" },
        {
          name: "System",
          description: "Health, readiness, and generated documentation endpoints.",
        },
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

  it("samples the tool and tier an approval card shows", () => {
    const presented = presentApiReferenceDocument(spec);
    const event = presented.components.schemas.DurableAgentSessionEvent.properties;
    expect(event.type).toMatchObject({
      description: "Chat event. An approval request pauses until Approve.",
      example: "agent.approval_requested",
    });
    expect(event.data).toMatchObject({
      description: "Payload the approval card reads.",
      example: {
        approvalId: "session_abc123/turn/0/approval/0",
        tool: "slack.post_message",
        trustTier: "act",
      },
    });
    expect(JSON.stringify(event.data.example)).not.toContain("acta_");
    expect(JSON.stringify(event.data.example)).not.toContain('"token"');
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

  it("samples the code shown before a failed run's reason", () => {
    const presented = presentApiReferenceDocument(spec);
    const run = presented.components.schemas.BackgroundTaskRun;
    expect(run.properties.errorCode).toMatchObject({
      description: "Code shown before a failed run's reason.",
      example: "llm_call_failed",
      nullable: true,
      type: "string",
    });
    expect(run.required).not.toContain("errorCode");
    expect(JSON.stringify(run.properties.errorCode)).not.toContain("acta_");
    expect(JSON.stringify(run.properties.errorCode)).not.toContain('"token"');
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

  it("samples the model a transcript call names", () => {
    const presented = presentApiReferenceDocument(spec);
    const event = presented.components.schemas.BackgroundTaskRunEvent.properties;
    expect(event.type).toMatchObject({
      description: "Heading for this transcript row. A model call is runtime.llm_call_started.",
      example: "runtime.llm_call_started",
    });
    expect(event.event).toMatchObject({
      description: "Payload the transcript reads. A model call names the model.",
      example: { model: "openai/gpt-4.1", type: "runtime.llm_call_started" },
    });
    expect(JSON.stringify(event.event.example)).not.toContain("acta_");
    expect(JSON.stringify(event.event.example)).not.toContain('"token"');
    expect(presented.components.schemas.BackgroundTaskRunEventInput.properties.type.example).toBe(
      "temporal.completed",
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
      billing.paths["/v1/me"]?.get?.responses?.["200"]?.content?.["application/json"]?.example
        ?.billing,
    ).toMatchObject({
      status: "trialing",
      trialExpiresAt: "2026-07-01T00:00:00.000Z",
    });
    expect(billing.components.schemas.Subscription.properties.status.example).toBe("active");
    expect(billing.components.schemas.BackgroundTaskRun.properties.status.example).toBe(
      "succeeded",
    );
    expect(
      billing.components.schemas.RevenueRelationship.properties.companyEnrichmentData,
    ).toMatchObject({
      description: "Facts the company list shows.",
      example: {
        employee_range: "201-500 employees (2026)",
        funding_summary: "$80M total; Series C, $35M, 2025-10-10",
        growth_signals: "Hiring in 2026",
        headquarters: "San Francisco, California, United States",
        revenue_range: "$40M-$60M (2025)",
      },
    });
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
    expect(text).toContain(
      "Installs or updates the maintained workflows for the signed-in person.",
    );
    expect(text).toContain("Cancel");
    expect(text).toContain("The stored cloud run is stopped");
    expect(text).not.toMatch(
      /Temporal|task\.yaml|API-worker|API-target|\bmirror\b|Instantiate|ndjson/,
    );
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

  it("samples the Retry trigger a run shows", () => {
    const presented = presentApiReferenceDocument(spec);
    const trigger = presented.components.schemas.BackgroundTaskRun.properties.trigger;
    expect(trigger).toMatchObject({
      description: "Trigger source for a task run.",
      example: "manual",
      enum: ["manual", "cron", "window", "event", "retry"],
      type: "string",
    });
    expect(JSON.stringify(trigger)).not.toContain("acta_");
    expect(JSON.stringify(trigger)).not.toContain('"token"');
  });

  it("names the observation a commitment event recorded", () => {
    const presented = presentApiReferenceDocument(spec);
    expect(presented.components.schemas.RevenueAction.properties.priorityComponents).toMatchObject({
      description: "Factors the review lists.",
      example: {
        commitment_urgency: 25,
        evidence_quality: 10,
        recency_signal: 12,
        relationship_value: 20,
        uncertainty_penalty: -5,
      },
    });
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
    expect(JSON.stringify(event.sourceObservationId)).not.toContain(
      "relationship-observation:ab12",
    );
    expect(
      presented.components.schemas.MissionControlEvidenceReference.properties.observationId.example,
    ).toBe(observationID);
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
      {
        properties?: Record<string, { example?: string; description?: string; nullable?: boolean }>;
      }
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
    expect(schemas.ConnectionStartResponse?.properties?.expires_at?.example).toBe(
      "2026-06-04T20:48:00Z",
    );
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
    expect(schemas.SlackWorkspace?.properties?.scopes?.example).toEqual([
      "channels:history",
      "chat:write",
    ]);
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
    expect(schemas.CreditLedger?.properties?.request_id?.example).toBe(
      "9e2fb15a-936d-4f39-9372-73cfe0476ca8",
    );
  });

  it("does not describe a voice key as a connector credential", () => {
    const presented = presentApiReferenceDocument(spec);
    const schemas = presented.components.schemas as Record<
      string,
      {
        properties?: Record<
          string,
          { example?: unknown; description?: string; nullable?: boolean }
        >;
      }
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
      {
        properties?: Record<
          string,
          { example?: unknown; description?: string; nullable?: boolean }
        >;
      }
    >;
    const ts = schemas.SlackThreadMessage?.properties?.ts;
    expect(ts?.description).toBe("Slack message timestamp.");
    expect(ts?.example).toBe("1700000000.000100");
    expect(ts?.nullable).toBe(true);
    expect(schemas.SlackThreadMessage?.properties?.user?.description).toBe(
      "Slack user id when present.",
    );
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
    expect(key?.key_prefix?.description).toBe(
      "First 16 characters of the secret. Safe to display.",
    );
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
    expect(schemas.RelationshipAttentionItem.properties.relationshipId.example).toBe(
      relationshipId,
    );
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
    expect(
      presented.components.schemas.RelationshipCommitment.properties.ownerParticipantRef.example,
    ).toBe("alex@example.com");
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
      example: ["9c8dfa9b-a7b2-46ea-982c-622a914c00e5", "3a196c5e-b10e-46cb-a177-7c001f7be573"],
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

  it("names the observation a lineage row moved", () => {
    const presented = presentApiReferenceDocument(spec);
    const lineage = presented.components.schemas.RelationshipIdentityLineage.properties;
    expect(lineage.observationIds).toMatchObject({
      description: "Moved observation ids.",
      example: ["6b8dfa9b-a7b2-46ea-982c-622a914c00e5"],
    });
    expect(lineage.observationIds.items.example).toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(JSON.stringify(lineage.observationIds)).not.toContain("observation:1");
    expect(lineage.id.example).not.toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(
      presented.components.schemas.MissionControlEvidenceReference.properties.observationId.example,
    ).toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("names the object a lineage row moved", () => {
    const presented = presentApiReferenceDocument(spec);
    const lineage = presented.components.schemas.RelationshipIdentityLineage.properties;
    const objectRef = "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(lineage.movedObjectRefs).toMatchObject({
      description: "All moved graph objects.",
      example: [objectRef],
    });
    expect(lineage.movedObjectRefs.items.example).toBe(objectRef);
    expect(JSON.stringify(lineage.movedObjectRefs)).not.toContain("relationship-observation:1");
    expect(
      presented.components.schemas.MissionControlEvidenceReference.properties.observationId.example,
    ).toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("names the identity a lineage row moved", () => {
    const presented = presentApiReferenceDocument(spec);
    const identityID = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const lineage = presented.components.schemas.RelationshipIdentityLineage.properties;
    expect(lineage.identityIds).toMatchObject({
      description: "Affected identity ids.",
      example: [identityID],
    });
    expect(lineage.identityIds.items.example).toBe(identityID);
    expect(JSON.stringify(lineage.identityIds)).not.toContain("identity:1");
    expect(lineage.id.example).not.toBe(identityID);
    expect(presented.components.schemas.RelationshipIdentity.properties.id.example).toBe(
      identityID,
    );
  });

  it("names the evidence behind an overdue promise", () => {
    const presented = presentApiReferenceDocument(spec);
    const item = presented.components.schemas.RelationshipAttentionItem.properties;
    const evidenceRef = "revenue-evidence:4b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(item.evidenceRefs).toMatchObject({
      description: "Evidence refs.",
      example: [evidenceRef],
    });
    expect(item.evidenceRefs.items.example).toBe(evidenceRef);
    expect(JSON.stringify(item.evidenceRefs)).not.toContain("relationship-observation:1");
    expect(item.reasonCode.example).toBe("overdue_commitment");
    expect(
      presented.components.schemas.RevenueAction.properties.evidence.items.properties.id.example,
    ).toBe("4b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("names the observation an identity review cites", () => {
    const presented = presentApiReferenceDocument(spec);
    const candidate = presented.components.schemas.RelationshipIdentityCandidate.properties;
    const evidenceRef = "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(candidate.evidenceRefs).toMatchObject({
      description: "Evidence references.",
      example: [evidenceRef],
    });
    expect(candidate.evidenceRefs.items.example).toBe(evidenceRef);
    expect(JSON.stringify(candidate.evidenceRefs)).not.toContain("relationship-observation:1");
    expect(
      presented.components.schemas.MissionControlEvidenceReference.properties.observationId.example,
    ).toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("names the people a commitment event recorded", () => {
    const presented = presentApiReferenceDocument(spec);
    const event = presented.components.schemas.CommitmentEvent.properties;
    expect(event.ownerParticipantRef).toMatchObject({
      description: "Promise owner.",
      example: "alex@example.com",
    });
    expect(event.counterpartyParticipantRef).toMatchObject({
      description: "Promise counterparty.",
      example: "jordan@example.com",
    });
    expect(event.beneficiaryParticipantRef).toMatchObject({
      description: "Promise beneficiary.",
      example: "customer:acme",
    });
    expect(event.actorRef.example).not.toBe("alex@example.com");
    expect(
      presented.components.schemas.RelationshipCommitment.properties.ownerParticipantRef.example,
    ).toBe("alex@example.com");
  });

  it("names the review item a conversation recorded", () => {
    const presented = presentApiReferenceDocument(spec);
    const observationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const claimID = "claim-risk";
    const itemID = `review:${createHash("sha256").update(`${observationID}:${claimID}:speaker`).digest("hex").slice(0, 16)}`;
    const batchID = `review:${createHash("sha256").update("oppulence:session-42:fingerprint-1:conversation-review-v1").digest("hex").slice(0, 24)}`;
    const review = presented.components.schemas.ConversationReviewItem.properties;
    expect(review.id).toMatchObject({
      description: "Stable review item id.",
      example: itemID,
    });
    expect(review.claimId).toMatchObject({
      description: "Material claim id.",
      example: claimID,
    });
    expect(review.batchId).toMatchObject({
      description: "Idempotent review batch id.",
      example: batchID,
    });
    expect(presented.components.schemas.ConversationClaim.properties.id).toMatchObject({
      description: "Stable claim id.",
      example: claimID,
    });
    expect(
      presented.components.schemas.RevenueAction.properties.evidence.items.properties.sourceRecordId
        .example,
    ).toBe(`oppulence:session-42:claim:${claimID}`);
  });

  it("names the assertion a contradiction resolution selects", () => {
    const presented = presentApiReferenceDocument(spec);
    const assertionID = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const media =
      presented.paths["/v1/relationships/{relationshipId}/contradictions/{caseId}/resolve"].post
        .requestBody.content["application/json"];
    expect(media.example.selectedAssertionId).toBe(assertionID);
    expect(media.schema.properties.selectedAssertionId).toMatchObject({
      description: "Selected assertion id.",
      example: assertionID,
      format: "uuid",
    });
    expect(
      presented.components.schemas.MissionControlDimensionEvidence.properties.assertionId.example,
    ).toBe(assertionID);
  });

  it("names the builtin conversation policy version", () => {
    const presented = presentApiReferenceDocument(spec);
    const layer = {
      layerId: "builtin:conversation-policy-v1",
      scope: "organization",
      enforced: true,
      capture: "require_consent",
      modelRoute: "hosted_allowed",
      publishEvidence: true,
      externalShare: true,
      retentionDays: 30,
      redactionClasses: ["credentials", "financial", "health", "personal_identifier"],
      legalHold: false,
    };
    const version = `policy:${createHash("sha256")
      .update(JSON.stringify([layer]))
      .digest("hex")
      .slice(0, 24)}`;
    const policy = presented.components.schemas.ResolvedConversationPolicy.properties;
    expect(policy.policyVersion).toMatchObject({
      description: "Hash-bound effective policy version.",
      example: version,
    });
    expect(policy.modelRoute.example).toBe("hosted_allowed");
    expect(policy.sourceLayerIds.items.example).toBe("builtin:conversation-policy-v1");
    expect(presented.components.schemas.CommunicationAccess.properties.policyVersion.example).toBe(
      1,
    );
  });

  it("names the meeting on a governance receipt", () => {
    const presented = presentApiReferenceDocument(spec);
    const receipt = presented.components.schemas.ConversationGovernanceReceipt.properties;
    expect(receipt.receiptId).toMatchObject({
      description: "Receipt id.",
      example: `governance:session-42:${receipt.capturedAt.example}`,
    });
  });

  it("samples the hash a relationship acknowledgement must match", () => {
    const presented = presentApiReferenceDocument(spec);
    const stateHash = "sha256:454f195e2389d36fd49e5c9b9656b7b47a3629332a84eb570edf3fa5248851e1";
    expect(presented.components.schemas.RevenueRelationship.properties.stateHash.example).toBe(
      stateHash,
    );
    expect(
      presented.components.schemas.RelationshipStateSnapshot.properties.stateHash.example,
    ).toBe(stateHash);
    expect(presented.components.schemas.MissionControlReadModel.properties.stateHash.example).toBe(
      stateHash,
    );
    expect(
      presented.components.schemas.MissionControlReadModel.properties.aggregateHash.example,
    ).toBe("sha256:cd34");
    const acknowledgement =
      presented.paths["/v1/relationships/{relationshipId}/acknowledgements"].post;
    expect(acknowledgement.requestBody.content["application/json"].example.stateHash).toBe(
      stateHash,
    );
    expect(
      acknowledgement.requestBody.content["application/json"].schema.properties.stateHash.example,
    ).toBe(stateHash);
    expect(
      acknowledgement.responses["201"].content["application/json"].schema.properties.stateHash
        .example,
    ).toBe(stateHash);
  });

  it("samples the relationship projector version the server stores", () => {
    const presented = presentApiReferenceDocument(spec);
    for (const name of [
      "RevenueRelationship",
      "RelationshipStateSnapshot",
      "RelationshipAttentionItem",
      "MissionControlReadModel",
    ]) {
      expect(presented.components.schemas[name].properties.projectorVersion.example).toBe(2);
    }
    expect(
      presented.components.schemas.RelationshipAttentionItem.properties.detectorVersion.example,
    ).toBe(1);
    expect(
      presented.components.schemas.MissionControlReadModel.properties.detectorVersion.example,
    ).toBe(1);
  });

  it("samples the hash stored on a Gmail observation", () => {
    const presented = presentApiReferenceDocument(spec);
    const contentHash = "c649f448e463924ae2a0923fcc6d409bc5a808004027b16bfbea961336650984";
    const observation = presented.components.schemas.RelationshipObservation.properties;
    expect(observation.contentHash.description).toBe(
      "Hash of the summary, the stored facts, and the saved payload.",
    );
    expect(observation.contentHash.example).toBe(contentHash);
    expect(observation.normalizedFacts.example).toEqual({ adapter: "gmail" });
    expect(observation.summary.example).toBe("We promised to send the security packet.");
    expect(
      presented.components.schemas.MissionControlEvidenceReference.properties.contentHash.example,
    ).toBe(contentHash);
  });

  it("samples the one-way support references for the published workspace", () => {
    const presented = presentApiReferenceDocument(spec);
    const diagnostics = presented.components.schemas.BetaDiagnostics.properties;
    expect(diagnostics.workspaceRef.example).toBe("workspace:sha256:1d811ce10de82ecb6ed8274b");
    const source = diagnostics.sources.items.properties;
    expect(source.connectionRef.example).toBe("connection:sha256:da73462ccdf527f07099a17f");
    expect(source.sourceAccountRef.example).toBe("source-account:sha256:24021bb72aca268d3989017b");
    expect(source.source.example).toBe("google");
  });

  it("samples the verification hash stored for a deletion target", () => {
    const presented = presentApiReferenceDocument(spec);
    const receipt = presented.components.schemas.ConversationDeletionReceipt.properties;
    const target = receipt.targets.items.properties;
    expect(target.target.example).toBe("api_evidence");
    expect(target.verificationHash.example).toBe(
      "sha256:5c15791fbeefd579cf530b240c1a3d5eec1d94058e045c8a4eadf0d1385ebfbf",
    );
  });

  it("samples the revision hash stored for a published draft", () => {
    const presented = presentApiReferenceDocument(spec);
    const hash = "sha256:746c1d9cd3925b8e632fc1b4bd539758514cb1aefdf31948fe8d1b45ce74c29d";
    const action = presented.components.schemas.RevenueAction.properties;
    expect(action.revisionHash).toMatchObject({
      description: "Canonical hash of the revision content.",
      example: hash,
    });
    expect(action.actionType.example).toBe("warm_follow_up");
    expect(action.executionMode.example).toBe("draft");
    expect(String(action.revisionHash.example)).not.toContain("...");
    const decision = presented.components.schemas.RevenuePolicyDecision.properties;
    expect(decision.revisionHash).toMatchObject({
      description: "Revision hash the decision is bound to.",
      example: hash,
    });
  });

  it("samples the acceptance key the commitment register sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/relationships/{relationshipId}/commitments/{commitmentId}/transitions"]
        .post.requestBody.content["application/json"];
    const key = "commitment-queue:accepted:8b8dfa9b-a7b2-46ea-982c-622a914c00e5:v3";
    expect(body.example).toMatchObject({
      kind: "accepted",
      idempotencyKey: key,
      reason: "Reviewed from the Commitment Queue (accepted).",
    });
    expect(body.example.evidenceRefs).toBeUndefined();
    expect(body.schema.properties.idempotencyKey.example).toBe(key);
    expect(body.schema.properties.evidenceRefs.items.example).toBe(`user-transition:${key}`);
    expect(body.schema.properties.evidenceRefs.description).toBe(
      "Evidence references. An omitted list is stored as this transition.",
    );
  });

  it("samples the decision key the identity inbox sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/relationship-identity-candidates/{candidateId}/decisions"].post
        .requestBody.content["application/json"];
    const key = "cb8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(body.example).toMatchObject({
      decision: "merge",
      expectedVersion: 1,
      idempotencyKey: key,
      reason: "Reviewed in the identity inbox: merge.",
    });
    expect(body.schema.properties.idempotencyKey).toMatchObject({
      example: key,
      format: "uuid",
    });
    expect(JSON.stringify(body)).not.toContain("identity-review:123");
  });

  it("samples the response id the shared plan page sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/public/mutual-action-plan/responses"].post.requestBody.content[
        "application/json"
      ];
    const responseID = "db8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(body.example).toMatchObject({
      kind: "confirm",
      responseId: responseID,
      comment: "",
    });
    expect(body.schema.properties.responseId).toMatchObject({
      example: responseID,
      format: "uuid",
    });
    expect(body.schema.properties.itemId.example).toBe("item:8b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(JSON.stringify(body)).not.toContain("response:ab12");
    expect(JSON.stringify(body)).not.toContain("item:ab12");
  });

  it("samples the deletion id the company page sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const requestID = "eb8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const body =
      presented.paths["/v1/relationships/{relationshipId}/conversation-deletion"].post.requestBody
        .content["application/json"];
    expect(body.example).toEqual({ requestId: requestID });
    expect(body.schema.properties.requestId).toMatchObject({
      example: requestID,
      format: "uuid",
    });
    expect(
      presented.components.schemas.ConversationDeletionReceipt.properties.receiptId,
    ).toMatchObject({
      example: requestID,
      format: "uuid",
    });
    expect(JSON.stringify(body)).not.toContain("delete:ab12");
    expect(
      JSON.stringify(presented.components.schemas.ConversationDeletionReceipt.properties.receiptId),
    ).not.toContain("delete:ab12");
  });

  it("samples the reasons focused review sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const correction =
      presented.paths["/v1/relationships/{relationshipId}/conversation-corrections"].post
        .requestBody.content["application/json"];
    const decision =
      presented.paths["/v1/relationships/{relationshipId}/conversation-decisions"].post.requestBody
        .content["application/json"];
    const correctionReason = "User corrected conversation evidence during focused review.";
    const decisionReason = "User decided a proposed conversation change.";
    expect(correction.example.reason).toBe(correctionReason);
    expect(correction.schema.properties.reason.example).toBe(correctionReason);
    expect(decision.example).toMatchObject({ kind: "approve", reason: decisionReason });
    expect(decision.schema.properties.reason.example).toBe(decisionReason);
    const encoded = JSON.stringify({ correction, decision });
    expect(encoded).not.toContain("Avery was the speaker.");
    expect(encoded).not.toContain("Customer stated this directly.");
    expect(encoded).not.toContain("Customer clarified this in the meeting.");
  });

  it("samples the task the graph follow-up button sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/revenue-actions"].post.requestBody.content["application/json"];
    expect(body.schema.properties.actionType.example).toBe("follow_up_task");
    expect(body.schema.properties.channel.example).toBe("task");
    expect(JSON.stringify(body)).not.toContain("They asked for a follow-up in July.");
    expect(JSON.stringify(body)).not.toContain("Hi Jordan");
  });

  it("samples the reason the queue Dismiss button sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/revenue-actions/{actionId}/dismiss"].post.requestBody.content[
        "application/json"
      ];
    expect(body.example).toEqual({ reason: "not_relevant" });
    expect(body.schema.properties.reason.example).toBe("not_relevant");
    expect(presented.components.schemas.RevenueAction.properties.dismissReason.example).toBe(
      "not_relevant",
    );
    expect(JSON.stringify(body)).not.toContain("already_handled");
  });

  it("samples the reason Confirm reject sends when the box is empty", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/revenue-actions/{actionId}/reject"].post.requestBody.content[
        "application/json"
      ];
    expect(body.example).toEqual({ reason: "not_appropriate" });
    expect(body.schema.properties.reason.example).toBe("not_appropriate");
    expect(JSON.stringify(body)).not.toContain("wrong_recipient");
  });

  it("samples the reason portfolio attention Acknowledge sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const reason = "Reviewed from the portfolio attention queue.";
    const body =
      presented.paths["/v1/relationship-attention/{attentionId}/decisions"].post.requestBody
        .content["application/json"];
    expect(body.example).toEqual({
      decision: "acknowledge",
      reason,
      expectedVersion: 1,
    });
    expect(body.schema.properties.reason.example).toBe(reason);
    expect(
      presented.components.schemas.RelationshipAttentionItem.properties.stateReason.example,
    ).toBe(reason);
    expect(JSON.stringify(body)).not.toContain("Reviewed with the account owner.");
  });

  it("samples the reason Confirm remove sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const body =
      presented.paths["/v1/relationship-persons/{personId}"].delete.requestBody.content[
        "application/json"
      ];
    expect(body.example).toEqual({ reason: "user_action" });
    expect(body.schema.properties.reason.example).toBe("user_action");
    expect(presented.components.schemas.PersonDeletionReceipt.properties.reason.example).toBe(
      "user_action",
    );
    expect(presented.paths["/v1/relationship-persons/{personId}"].delete.summary).toBe(
      "Remove a person",
    );
  });

  it("samples the consent Allow public research sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/research/consent"].put;
    const body = operation.requestBody.content["application/json"];
    expect(operation.summary).toBe("Allow public research");
    expect(body.example).toEqual({ consented: true });
    expect(body.schema.properties.consented.example).toBe(true);
    expect(
      presented.components.schemas.CloudResearchConsentState.properties.consented.example,
    ).toBe(true);
  });

  it("samples the ids Fill in companies and people sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const company = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const person = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const companies = presented.paths["/v1/research/companies"].post;
    const people = presented.paths["/v1/research/people"].post;
    expect(companies.summary).toBe("Fill in companies");
    expect(people.summary).toBe("Fill in people");
    expect(companies.requestBody.content["application/json"].example).toEqual({
      relationshipIds: [company],
    });
    expect(people.requestBody.content["application/json"].example).toEqual({
      personIds: [person],
    });
  });

  it("samples the plan Upgrade to Pro sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/billing/checkout-session"].post;
    const body = operation.requestBody.content["application/json"];
    expect(operation.summary).toBe("Upgrade to Pro");
    expect(body.example).toEqual({ plan: "pro" });
    expect(body.schema.properties.plan.example).toBe("pro");
    expect(body.schema.properties.plan.enum).toEqual(["starter", "pro", "intelligence"]);
  });

  it("samples the privacy rule Add rule sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/revenue-workspaces/current/communication-privacy-rules"].post;
    const body = operation.requestBody.content["application/json"];
    const stored = operation.responses["201"].content["application/json"];
    expect(operation.summary).toBe("Add rule");
    expect(body.example).toEqual({ kind: "protected_address", value: "buyer@example.com" });
    expect(body.schema.properties.kind.example).toBe("protected_address");
    expect(body.schema.properties.kind.enum).toEqual([
      "protected_address",
      "protected_domain",
      "blocked_address",
      "blocked_domain",
    ]);
    expect(body.schema.properties.value.example).toBe("buyer@example.com");
    expect(stored.example).toMatchObject({
      id: "3b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      kind: "protected_address",
      value: "buyer@example.com",
      valueHash: "sha256:6a6c26195c3682faa816966af789717c3bfa834eee6c599d667d2b3429c27cfd",
      active: true,
    });
  });

  it("samples the public research status the companies page checks", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/research/status"].get;
    const body = operation.responses["200"].content["application/json"];
    expect(operation.summary).toBe("Check public research");
    expect(body.example).toEqual({
      available: true,
      allowed: false,
      reason: "consent_required",
      requiredPlan: "intelligence",
      consent: { consented: false },
    });
    expect(body.schema.properties.reason.example).toBe("consent_required");
    expect(body.schema.properties.reason.enum).toEqual([
      "consent_required",
      "plan_required",
      "capability_disabled",
      "provider_unconfigured",
      "unavailable",
    ]);
    expect(body.schema.properties.requiredPlan.example).toBe("intelligence");
  });

  it("samples the research estimates the companies page adds together", () => {
    const presented = presentApiReferenceDocument(spec);
    const companies = presented.paths["/v1/research/companies/estimate"].get;
    const people = presented.paths["/v1/research/people/estimate"].get;
    expect(companies.summary).toBe("Estimate companies");
    expect(people.summary).toBe("Estimate people");
    expect(companies.responses["200"].content["application/json"].example).toEqual({
      companies: 1,
      processor: "pro",
      credits: 1000,
      usd: 0.1,
      batchSize: 25,
    });
    expect(people.responses["200"].content["application/json"].example).toEqual({
      people: 1,
      processor: "pro",
      credits: 1000,
      usd: 0.1,
      batchSize: 25,
    });
  });

  it("samples the pending ids Fill in companies and people reads", () => {
    const presented = presentApiReferenceDocument(spec);
    const companies = presented.paths["/v1/research/companies/pending"].get;
    const people = presented.paths["/v1/research/people/pending"].get;
    expect(companies.summary).toBe("Pending companies");
    expect(people.summary).toBe("Pending people");
    expect(companies.responses["200"].content["application/json"].example).toEqual({
      relationshipIds: ["9c8dfa9b-a7b2-46ea-982c-622a914c00e5"],
    });
    expect(people.responses["200"].content["application/json"].example).toEqual({
      personIds: ["1b8dfa9b-a7b2-46ea-982c-622a914c00e5"],
    });
  });

  it("samples the forgotten promise Reconcile now returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/commitment-recovery/run"].post;
    const stored = operation.responses["201"].content["application/json"].example.evaluations[0];
    expect(operation.summary).toBe("Reconcile now");
    expect(operation.requestBody.content["application/json"].example).toEqual({});
    expect(operation.responses["200"]).toBeUndefined();
    expect(stored).toMatchObject({
      evaluationId: "recovery:7cb1669953b1015129545ab3",
      commitmentId: "8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      commitmentVersion: 3,
      classification: "forgotten",
      proposedActionType: "reminder",
      requiresReview: true,
      explanation: "This promise is past due and nothing newer has closed it.",
      reconcilerVersion: "commitment-recovery-v1",
      evidenceRefs: [],
      staleSources: null,
    });
  });

  it("samples the six-month window Run Promise Leak Audit sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const audit = presented.paths["/v1/revenue-leak-scans"].post;
    expect(audit.summary).toBe("Run Promise Leak Audit");
    expect(audit.requestBody.content["application/json"].example).toEqual({ lookbackDays: 180 });
    const started = audit.responses["202"].content["application/json"].example;
    expect(started).toMatchObject({
      status: "running",
      lookbackDays: 180,
      threadsSeen: 0,
      mode: "local",
    });
    expect(started.completedAt).toBeUndefined();
    expect(started.error).toBeUndefined();
    expect(presented.components.schemas.RevenueLeakScan.properties.status).toMatchObject({
      description: "Scan status.",
      example: "running",
    });
    expect(presented.components.schemas.RevenueLeakScan.properties.lookbackDays.example).toBe(180);
  });

  it("samples the reply Log outcome records from the history sheet", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/outcomes"].post;
    const eventID = "manual:replied:1783864800000";
    expect(operation.summary).toBe("Log outcome");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      kind: "replied",
      source: "user",
      sourceEventId: eventID,
    });
    expect(operation.responses["201"].content["application/json"].example).toMatchObject({
      kind: "replied",
      source: "user",
      sourceEventId: eventID,
      occurredAt: "2026-07-12T14:00:00Z",
    });
    expect(presented.components.schemas.RevenueOutcome.properties.source.example).toBe("user");
    expect(presented.components.schemas.RevenueOutcome.properties.sourceEventId.example).toBe(
      eventID,
    );
  });

  it("samples the plan Approve this plan returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const approve =
      presented.paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/approve"]
        .post;
    expect(approve.summary).toBe("Approve this plan");
    expect(approve.responses["200"]).toBeUndefined();
    const approved = approve.responses["201"].content["application/json"].example;
    expect(approved.status).toBe("internally_approved");
    expect(approved.tokenState).toBe("not_issued");
    expect(approved.sharePolicyDecisionId).toBeUndefined();
    expect(approved.currentRevision.revisionHash).toBe(
      "sha256:935371863ce9346ba2c85a787c066e76f7afd07a607fab5a9c3badb5034a4966",
    );
    expect(approve.requestBody.content["application/json"].example).toEqual({});

    const share =
      presented.paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/share"].post;
    expect(share.summary).toBe("Draft an email to share this plan");
    expect(share.responses["200"]).toBeUndefined();
    const shared = share.responses["201"].content["application/json"].example;
    expect(shared.plan.status).toBe("shared");
    expect(shared.plan.tokenState).toBe("active");
    expect(shared.plan.sharePolicyDecisionId).toBe("governance:ab12cd34ef56789012345678");
    expect(shared.responseToken).toHaveLength(64);
    expect(share.requestBody.content["application/json"].example).toEqual({});
  });

  it("samples the mailbox policy Email and Calendar privacy loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const policy =
      presented.paths["/v1/revenue-workspaces/current/communication-policy/{sourceAccountId}"].get;
    expect(policy.summary).toBe("Mailbox policy");
    expect(policy.parameters[0].schema.example).toBe("you@company.com");
    const stored = policy.responses["200"].content["application/json"].example;
    expect(stored).toMatchObject({
      id: "db8dfa9b-a7b2-46ea-982c-622a914c00e5",
      sourceAccountId: "you@company.com",
      metadataVisibility: "workspace",
      shareSubject: true,
      shareBody: false,
      shareAttachments: false,
      signatureEnrichment: true,
      modelContactExtraction: true,
      retentionDays: 540,
      version: 1,
    });
    expect(policy.responses["404"]).toBeTruthy();
  });

  it("samples the draft plan Create from promises they accepted returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const create = presented.paths["/v1/relationships/{relationshipId}/mutual-action-plans"].post;
    expect(create.summary).toBe("Create from promises they accepted");
    expect(create.requestBody.content["application/json"].example.commitmentIds).toEqual([
      "8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
    ]);
    expect(create.responses["200"]).toBeUndefined();
    const plan = create.responses["201"].content["application/json"].example;
    expect(plan.status).toBe("draft");
    expect(plan.tokenState).toBe("not_issued");
    expect(plan.sharePolicyDecisionId).toBeUndefined();
    expect(plan.currentRevision.revisionHash).toBe(
      "sha256:b718e82644ea4d98cb7a1f3ee6503cd6d3463df9c211e85051737f7654067f4d",
    );
    expect(plan.currentRevision.items[0].title).toBe("Send the security packet.");
    expect(plan.currentRevision.items[0].dueAt).toBe("2026-07-22T17:00:00Z");
  });

  it("samples the disconnected source Disconnect stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationship-sources/{source}/{sourceAccountId}/disconnect"].post;
    expect(operation.summary).toBe("Disconnect");
    expect(operation.operationId).toBe("disconnectRelationshipSource");
    expect(operation.requestBody).toBeUndefined();
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      source: "google",
      sourceAccountId: "me@company.com",
      status: "disconnected",
      backfillPhase: "idle",
      completeness: "disconnected",
      lagSeconds: 0,
      disconnectedAt: "2026-07-31T14:00:00Z",
    });
    expect(
      operation.responses["200"].content["application/json"].example.nextRetryAt,
    ).toBeUndefined();
    expect(presented.components.schemas.RelationshipSourceStatus.properties.status.example).toBe(
      "live",
    );
  });

  it("samples the privacy rule Remove deletes", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/revenue-workspaces/current/communication-privacy-rules/{ruleId}"].delete;
    expect(operation.summary).toBe("Remove");
    expect(operation.operationId).toBe("deleteCommunicationPrivacyRule");
    expect(operation.requestBody).toBeUndefined();
    expect(operation.responses["204"].description).toBe("Privacy rule removed.");
    expect(operation.responses["200"]).toBeUndefined();
    expect(operation.parameters[0].schema.example).toBe("3b8dfa9b-a7b2-46ea-982c-622a914c00e5");
  });

  it("samples the seven-day wake time Snooze stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/snooze"].post;
    const wake = "2026-08-07T14:00:00Z";
    expect(operation.summary).toBe("Snooze");
    expect(operation.operationId).toBe("snoozeRevenueAction");
    expect(operation.requestBody.content["application/json"].example).toEqual({ until: wake });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      id: "1a8dfa9b-a7b2-46ea-982c-622a914c00e5",
      queueStatus: "snoozed",
      snoozedUntil: wake,
    });
    expect(presented.components.schemas.RevenueAction.properties.queueStatus.example).toBe("open");
  });

  it("samples the subject and message Save draft posts", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/edit"].post;
    expect(operation.summary).toBe("Save draft");
    expect(operation.operationId).toBe("editRevenueAction");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      proposedSubject: "Following up as promised",
      proposedMessage: "Hi Jordan — circling back as promised.",
    });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      revision: 2,
      revisionHash: "sha256:35a77a7dc38e7b2d73e06e754a8a5767b3b8af2234f5caeeb532c63e488b2925",
      policyStatus: "pending",
      approvalStatus: "pending",
    });
    expect(presented.components.schemas.RevenueAction.properties.revision.example).toBe(1);
  });

  it("samples the sent handled action Create provider draft stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/execute"].post;
    expect(operation.summary).toBe("Create provider draft");
    expect(operation.operationId).toBe("executeRevenueAction");
    expect(operation.requestBody).toBeUndefined();
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      executionMode: "draft",
      executionStatus: "sent",
      queueStatus: "handled",
      providerMessageId: "draft_1",
      executedAt: "2026-07-12T12:06:00Z",
    });
    expect(presented.components.schemas.RevenueAction.properties.executionStatus.example).toBe(
      "pending",
    );
    expect(presented.components.schemas.RevenueAction.properties.queueStatus.example).toBe("open");
  });

  it("samples the approved revision Approve stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/approve"].post;
    expect(operation.summary).toBe("Approve");
    expect(operation.operationId).toBe("approveRevenueAction");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      acceptRisk: false,
    });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      approvalStatus: "approved",
      approvedRevision: 1,
      approvedAt: "2026-07-12T12:05:00Z",
      queueStatus: "open",
      executionStatus: "pending",
      executionMode: "draft",
    });
    expect(
      operation.responses["200"].content["application/json"].example.executedAt,
    ).toBeUndefined();
    expect(presented.components.schemas.RevenueAction.properties.approvalStatus.example).toBe(
      "pending",
    );
  });

  it("samples the passed decision Re-check policy stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/evaluate"].post;
    expect(operation.summary).toBe("Re-check policy");
    expect(operation.operationId).toBe("evaluateRevenueAction");
    expect(operation.requestBody).toBeUndefined();
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      id: "2b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      revision: 1,
      revisionHash: "sha256:ab12...",
      status: "passed",
      reasonCodes: [],
      evaluatedAt: "2026-07-12T12:00:00Z",
      expiresAt: "2026-07-13T12:00:00Z",
    });
    expect(presented.components.schemas.RevenuePolicyDecision.properties.status).toMatchObject({
      description: "Decision status.",
      example: "passed",
    });
    expect(
      presented.components.schemas.RevenuePolicyDecision.properties.reasonCodes.items.example,
    ).toBe("suppression.opted_out");
  });

  it("samples the rejected recommendation Reject stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-recommendations/{actionId}/reject"].post;
    expect(operation.summary).toBe("Reject");
    expect(operation.operationId).toBe("rejectRelationshipRecommendation");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      reason: "Not the right next move",
    });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      approvalStatus: "rejected",
      queueStatus: "open",
      reason: "They asked for a follow-up in July.",
    });
    expect(
      operation.responses["200"].content["application/json"].example.approvedAt,
    ).toBeUndefined();
    expect(presented.components.schemas.RevenueAction.properties.approvalStatus.example).toBe(
      "pending",
    );
  });

  it("samples the approved revision Approve stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-recommendations/{actionId}/approve"].post;
    expect(operation.summary).toBe("Approve");
    expect(operation.description).toContain("acceptRisk false");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      acceptRisk: false,
    });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      id: "1a8dfa9b-a7b2-46ea-982c-622a914c00e5",
      approvalStatus: "approved",
      approvedRevision: 1,
      approvedAt: "2026-07-12T12:05:00Z",
      queueStatus: "open",
      executionStatus: "pending",
      executionMode: "draft",
      reason: "They asked for a follow-up in July.",
    });
    expect(
      operation.responses["200"].content["application/json"].example.executedAt,
    ).toBeUndefined();
    expect(
      operation.responses["200"].content["application/json"].example.providerMessageId,
    ).toBeUndefined();
    expect(presented.components.schemas.RevenueAction.properties.approvalStatus.example).toBe(
      "pending",
    );
  });

  it("samples the note template Save template stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/console/resources"].post;
    expect(operation.summary).toBe("Save template");
    expect(operation.description).toContain("Weekly account review");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      kind: "note_template",
      name: "Weekly account review",
      payload: { title: "Weekly account review", body: "Agenda" },
    });
    expect(operation.responses["201"].content["application/json"].example).toMatchObject({
      id: "bed845f2-975a-4678-9c86-2157548161e4",
      kind: "note_template",
      name: "Weekly account review",
      sortOrder: 0,
      payload: { title: "Weekly account review", body: "Agenda" },
    });
    expect(presented.components.schemas.ConsoleResourceKind.example).toBe("graph_saved_view");
  });

  it("samples the note template Save template stores on edit", () => {
    const presented = presentApiReferenceDocument(spec);
    const patch = presented.paths["/v1/console/resources/{resourceId}"].patch;
    expect(patch.summary).toBe("Save template");
    expect(patch.description).toBe(
      "Save template posts the name and payload of an existing note template. The name and the title are Weekly account review, and the body is Agenda. The stored template keeps that title and body, with sort order 0, and the update time is later.",
    );
    expect(patch.requestBody.content["application/json"].example).toEqual({
      name: "Weekly account review",
      payload: { title: "Weekly account review", body: "Agenda" },
    });
    expect(patch.responses["200"].description).toBe("Stored template.");
    expect(patch.responses["200"].content["application/json"].example).toEqual({
      id: "bed845f2-975a-4678-9c86-2157548161e4",
      kind: "note_template",
      name: "Weekly account review",
      payload: { title: "Weekly account review", body: "Agenda" },
      sortOrder: 0,
      createdAt: "2026-09-17T20:00:00Z",
      updatedAt: "2026-09-17T20:01:00Z",
    });
    expect(patch.parameters[0].schema.example).toBe("bed845f2-975a-4678-9c86-2157548161e4");
    expect(presented.components.schemas.ConsoleResourceKind.example).toBe("graph_saved_view");
    expect(presented.components.schemas.ConsoleResource.properties.name.example).toBe(
      "Renewal risk",
    );
  });

  it("samples the display name Save profile stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const patch = presented.paths["/v1/console/preferences"].patch;
    expect(patch.summary).toBe("Save profile");
    expect(patch.description).toBe(
      "Save profile posts the display name. The name is Ada Lovelace. The stored preferences keep that name, an empty default agent, usage sharing off, notifications off, model reasoning hidden, and the system theme.",
    );
    expect(patch.requestBody.content["application/json"].example).toEqual({
      displayName: "Ada Lovelace",
    });
    expect(patch.responses["200"].description).toBe("Stored profile.");
    expect(patch.responses["200"].content["application/json"].example).toEqual({
      displayName: "Ada Lovelace",
      defaultAgentSlug: "",
      shareUsageData: false,
      notificationLevel: "off",
      showModelReasoning: false,
      theme: "system",
    });
    const fields = presented.components.schemas.ConsolePreferences.properties;
    expect(fields.defaultAgentSlug.example).toBe("assistant");
    expect(fields.shareUsageData.example).toBe(true);
    expect(fields.notificationLevel.example).toBe("attention");
  });

  it("samples the draft Create workflow stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/background-tasks"].post;
    expect(post.summary).toBe("Create workflow");
    expect(post.description).toBe(
      "Create workflow posts a draft named Follow up when a promise slips. It runs in the cloud, starts when a communication event matches, and stays inactive. The stored workflow keeps that name, the address follow-up-when-a-promise-slips, those instructions and triggers, cloud execution, revision 1, and schedule sync paused.",
    );
    const request = post.requestBody.content["application/json"].example;
    expect(request).toMatchObject({
      name: "Follow up when a promise slips",
      active: false,
      executionTarget: "api",
    });
    expect(request.slug).toBeUndefined();
    expect(request.model).toBeUndefined();
    expect(request.provider).toBeUndefined();
    expect(request.createdAt).toBeUndefined();
    expect(request.triggers.workflow.trigger.kind).toBe("communication");
    expect(request.triggers.eventMatchCriteria).toContain("Gmail, Calendar, or HubSpot");
    expect(request.instructions).toContain("Objective: When a promise is about to slip");
    expect(request.instructions).toContain("scope: matching-record");
    const stored = post.responses["201"].content["application/json"].example;
    expect(post.responses["201"].description).toBe("Stored workflow.");
    expect(stored).toMatchObject({
      id: "c8dfa9b6-a7b2-46ea-982c-622a914c00e5",
      slug: "follow-up-when-a-promise-slips",
      name: "Follow up when a promise slips",
      active: false,
      executionTarget: "api",
      systemManaged: false,
      scheduleSyncState: "paused",
      revision: 1,
      createdAt: "2026-06-04T20:38:00Z",
      updatedAt: "2026-06-04T20:38:00Z",
    });
    expect(presented.components.schemas.BackgroundTask.properties.executionTarget.example).toBe(
      "desktop",
    );
    expect(presented.components.schemas.BackgroundTask.properties.name.example).toBe(
      "Daily Account Summary",
    );
  });

  it("samples the workflow Use Inbox Digest stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/background-task-templates/{templateSlug}/instantiate"].post;
    expect(post.summary).toBe("Use Inbox Digest");
    expect(post.description).toBe(
      "Use Inbox Digest posts an empty body. The stored workflow is named Inbox Digest, stays active, and runs in the cloud. It starts at 8:00 on weekdays in America/New_York, keeps the template instructions, model, and provider, and records revision 1 with schedule sync paused.",
    );
    expect(post.requestBody.content["application/json"].example).toEqual({});
    expect(post.parameters[0].schema.example).toBe("inbox-digest");
    expect(post.responses["201"].description).toBe("Stored workflow.");
    expect(post.responses["201"].content["application/json"].example).toMatchObject({
      id: "d8dfa9b6-a7b2-46ea-982c-622a914c00e5",
      slug: "inbox-digest",
      name: "Inbox Digest",
      active: true,
      executionTarget: "api",
      model: "anthropic/claude-sonnet-4-5",
      provider: "openrouter",
      systemManaged: false,
      scheduleSyncState: "paused",
      revision: 1,
      triggers: { cronExpr: "0 8 * * 1-5", timezone: "America/New_York" },
    });
    expect(post.responses["201"].content["application/json"].example.instructions).toContain(
      "deadlines and blockers",
    );
    expect(
      presented.components.schemas.BackgroundTaskTemplate.properties.instructions.example,
    ).toBe("Review recent important Gmail messages and produce a markdown digest.");
  });

  it("samples the cloud run Run now stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/background-tasks/{slug}/trigger"].post;
    expect(post.summary).toBe("Run now");
    expect(post.description).toBe(
      "Run now posts a manual start from the visual workflow editor. The stored cloud run stays queued, keeps the note Started from the visual workflow editor, uses cloud execution, and records revision 2.",
    );
    expect(post.requestBody.content["application/json"].example).toEqual({
      trigger: "manual",
      context: "Started from the visual workflow editor.",
    });
    expect(post.parameters[0].schema.example).toBe("follow-up-when-a-promise-slips");
    expect(post.responses["202"].description).toBe("Stored run.");
    expect(post.responses["202"].content["application/json"].example).toMatchObject({
      id: "88f5e632-a841-4557-a8e4-9b8f0d207ff4",
      runId: "api-trigger-5b41958c-3a0a-4cb2-9361-ea563cd0477b",
      slug: "follow-up-when-a-promise-slips",
      trigger: "manual",
      status: "queued",
      executor: "api",
      attempt: 1,
      requestedContext: "Started from the visual workflow editor.",
      temporalStatus: "Started",
      progressPercent: 0,
      progressMessage: "Queued for API worker.",
      revision: 2,
    });
    expect(
      presented.components.schemas.BackgroundTaskTriggerRequest.properties.context.example,
    ).toBe("Run this now and focus on high-risk accounts.");
    expect(presented.components.schemas.BackgroundTaskRun.properties.slug.example).toBe(
      "daily-summary",
    );
  });

  it("samples the stopped run Cancel stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/background-tasks/{slug}/runs/{runId}/cancel"].post;
    expect(post.summary).toBe("Cancel");
    expect(post.description).toBe(
      "Cancel posts an empty body. The stored cloud run is stopped, its progress is Cancellation requested, and the revision is 3.",
    );
    expect(post.requestBody.content["application/json"].example).toEqual({});
    expect(post.parameters[0].schema.example).toBe("follow-up-when-a-promise-slips");
    expect(post.parameters[1].schema.example).toBe(
      "api-trigger-5b41958c-3a0a-4cb2-9361-ea563cd0477b",
    );
    expect(post.responses["202"].description).toBe("Stopped run.");
    expect(post.responses["202"].content["application/json"].example).toMatchObject({
      slug: "follow-up-when-a-promise-slips",
      status: "stopped",
      executor: "api",
      requestedContext: "Started from the visual workflow editor.",
      temporalStatus: "Canceled",
      progressMessage: "Cancellation requested.",
      revision: 3,
    });
  });

  it("samples the cloud run Retry stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/background-tasks/{slug}/runs/{runId}/retry"].post;
    expect(post.summary).toBe("Retry");
    expect(post.description).toBe(
      "Retry posts an empty body. The stored cloud run is a new queued attempt of the stopped run, keeps the editor note, and records attempt 2.",
    );
    expect(post.requestBody.content["application/json"].example).toEqual({});
    expect(post.parameters[1].schema.example).toBe(
      "api-trigger-5b41958c-3a0a-4cb2-9361-ea563cd0477b",
    );
    expect(post.responses["202"].description).toBe("Stored retry.");
    expect(post.responses["202"].content["application/json"].example).toMatchObject({
      runId: "retry-6c41958c-3a0a-4cb2-9361-ea563cd0477b",
      previousRunId: "api-trigger-5b41958c-3a0a-4cb2-9361-ea563cd0477b",
      retryOfRunId: "api-trigger-5b41958c-3a0a-4cb2-9361-ea563cd0477b",
      slug: "follow-up-when-a-promise-slips",
      trigger: "retry",
      status: "queued",
      executor: "api",
      attempt: 2,
      requestedContext: "Started from the visual workflow editor.",
      progressMessage: "Queued retry for API worker.",
      revision: 2,
    });
    expect(presented.components.schemas.BackgroundTaskRun.properties.trigger.example).toBe(
      "manual",
    );
    expect(presented.components.schemas.BackgroundTaskRun.properties.trigger.enum).toContain(
      "retry",
    );
  });

  it("samples the workflow Save stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const patch = presented.paths["/v1/background-tasks/{slug}"].patch;
    expect(patch.summary).toBe("Save");
    expect(patch.description).toBe(
      "Save posts the name, instructions, and triggers at revision 1. The stored workflow keeps the name Follow up when a promise slips, those instructions and triggers, cloud execution, and revision 2.",
    );
    expect(patch.requestBody.content["application/json"].example).toMatchObject({
      revision: 1,
      name: "Follow up when a promise slips",
      triggers: {
        eventMatchCriteria:
          "A Gmail, Calendar, or HubSpot event materially changes a customer relationship, commitment, objection, decision, or next step.",
        workflow: { trigger: { kind: "communication" } },
      },
    });
    expect(patch.requestBody.content["application/json"].example.instructions).toContain(
      "scope: matching-record",
    );
    expect(patch.requestBody.content["application/json"].example.lastRunSummary).toBeUndefined();
    expect(patch.responses["200"].description).toBe("Stored workflow.");
    expect(patch.responses["200"].content["application/json"].example).toMatchObject({
      slug: "follow-up-when-a-promise-slips",
      name: "Follow up when a promise slips",
      active: false,
      executionTarget: "api",
      scheduleSyncState: "paused",
      revision: 2,
    });
    expect(
      presented.paths["/v1/background-tasks/{slug}"].get.responses["200"].content[
        "application/json"
      ].example.slug,
    ).toBe("daily-summary");
  });

  it("samples the next run a paused workflow reports", () => {
    const presented = presentApiReferenceDocument(spec);
    const read = presented.paths["/v1/background-tasks/{slug}/schedule-state"].get;
    expect(read.summary).toBe("Next run");
    expect(read.description).toContain("health paused");
    expect(read.parameters[0].schema.example).toBe("follow-up-when-a-promise-slips");
    const stored = read.responses["200"].content["application/json"].example;
    expect(stored).toMatchObject({
      target: "api",
      triggerSources: ["event"],
      health: "paused",
      mechanism: "none",
      nextDueAt: null,
      sources: { event: { mechanism: "none", health: "paused", nextDueAt: null } },
    });
    expect(stored.scheduleSyncState).toBeUndefined();
  });

  it("samples the agent Create agent stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const create = presented.paths["/v1/agents"].post;
    expect(create.summary).toBe("Create agent");
    expect(create.description).toContain("Customer concierge");
    const request = create.requestBody.content["application/json"].example;
    expect(request).toMatchObject({
      slug: "customer-concierge",
      name: "Customer concierge",
      model: "",
      provider: "",
      enabledTools: [],
      limits: {},
    });
    const stored = create.responses["201"].content["application/json"].example;
    expect(stored).toMatchObject({
      slug: "customer-concierge",
      name: "Customer concierge",
      source: "tenant",
      enabledTools: [],
    });
    expect(stored.model).toBeUndefined();
    expect(stored.provider).toBeUndefined();
  });

  it("samples the agent Confirm delete removes", () => {
    const presented = presentApiReferenceDocument(spec);
    const remove = presented.paths["/v1/agents/{slug}"].delete;
    expect(remove.summary).toBe("Confirm delete");
    expect(remove.description).toContain("customer-concierge");
    expect(remove.requestBody).toBeUndefined();
    expect(remove.parameters[0].schema.example).toBe("customer-concierge");
    expect(remove.responses["204"].description).toBe("Agent removed.");
  });

  it("samples the first chat message Submit stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const sessionPath = presented.paths["/v1/agent-sessions"];
    const post = sessionPath.post;
    expect(post.summary).toBe("Submit");
    expect(post.description).toContain("Ask about a company, a promise, or the next step.");
    expect(post.description).toContain("no completed turns");
    expect(post.requestBody.content["application/json"].example).toEqual({
      agent: "assistant",
      input: "Ask about a company, a promise, or the next step.",
      title: "Ask about a company, a promise, or the next step.",
      channel: "web",
    });
    expect(post.responses["201"].content["application/json"].example).toMatchObject({
      sessionId: "f8dfa9b6-a7b2-46ea-982c-622a914c00e5",
      agent: "assistant",
      agentSource: "builtin",
      status: "active",
      channel: "web",
      title: "Ask about a company, a promise, or the next step.",
      turns: 0,
      llmCalls: 0,
      toolCalls: 0,
      costUnits: 0,
      continuationToken: "agt_example",
    });
    const listed = sessionPath.get.responses["200"].content["application/json"].example.sessions[0];
    expect(listed.title).toBe("Review the Acme renewal");
    expect(listed.turns).toBe(2);
  });

  it("samples the chat Stop response ends", () => {
    const presented = presentApiReferenceDocument(spec);
    const stop = presented.paths["/v1/agent-sessions/{id}/cancel"].post;
    expect(stop.summary).toBe("Stop response");
    expect(stop.description).toContain("no body");
    expect(stop.description).toContain("canceling");
    expect(stop.requestBody).toBeUndefined();
    expect(stop.parameters[0].schema.example).toBe("session_abc123");
    expect(stop.responses["202"].description).toBe("Stop accepted.");
    expect(stop.responses["202"].content["application/json"].example).toEqual({
      sessionId: "session_abc123",
      status: "canceling",
    });
  });

  it("samples the chat approval Approve stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const approve = presented.paths["/v1/agent-sessions/{id}/approvals/{approvalId}"].post;
    expect(approve.summary).toBe("Approve");
    expect(approve.description).toContain("decision granted");
    expect(approve.requestBody.content["application/json"].example).toEqual({
      decision: "granted",
    });
    expect(approve.responses["202"].content["application/json"].example).toEqual({
      approvalId: "session_abc123/turn/0/approval/0",
      decision: "granted",
    });
    expect(JSON.stringify(approve.requestBody)).not.toContain("resolvedBy");
  });

  it("samples the next chat message Submit stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const turn = presented.paths["/v1/agent-sessions/{id}/turns"].post;
    expect(turn.summary).toBe("Submit");
    expect(turn.description).toContain("Ask about a company, a promise, or the next step.");
    expect(turn.description).toContain("sequence 1");
    expect(turn.requestBody.content["application/json"].example).toEqual({
      input: "Ask about a company, a promise, or the next step.",
    });
    expect(turn.responses["202"].content["application/json"].example).toEqual({
      accepted: true,
      turnSeq: 1,
    });
    expect(JSON.stringify(turn.requestBody)).not.toContain("channel");
    const listed =
      presented.paths["/v1/agent-sessions"].get.responses["200"].content["application/json"].example
        .sessions[0];
    expect(listed.title).toBe("Review the Acme renewal");
    expect(listed.turns).toBe(2);
  });

  it("samples the agents page list", () => {
    const presented = presentApiReferenceDocument(spec);
    const list = presented.paths["/v1/agents"].get;
    expect(list.summary).toBe("List agents");
    expect(list.description).toContain("Assistant");
    expect(list.description).toContain("builtin");
    expect(list.requestBody).toBeUndefined();
    const agents = list.responses["200"].content["application/json"].example.agents;
    expect(agents).toHaveLength(3);
    expect(agents[0]).toMatchObject({
      slug: "assistant",
      name: "Assistant",
      source: "builtin",
    });
    expect(agents[0].enabledTools).toContain("workspace.read");
    expect(agents[1]).toMatchObject({ slug: "concierge", name: "Concierge", source: "builtin" });
    expect(agents[2]).toMatchObject({
      slug: "concierge-slack",
      name: "Slack Concierge",
      source: "builtin",
    });
  });

  it("samples the first line Follow the chat reads", () => {
    const presented = presentApiReferenceDocument(spec);
    const stream = presented.paths["/v1/agent-sessions/{id}/stream"].get;
    expect(stream.summary).toBe("Follow the chat");
    expect(stream.description).toContain("sequence 0");
    expect(stream.description).toContain("Assistant");
    expect(stream.requestBody).toBeUndefined();
    const cursor = stream.parameters.find((param: { name?: string }) => param.name === "afterSeq");
    expect(cursor.required).toBe(false);
    expect(cursor.schema.example).toBeUndefined();
    const line = stream.responses["200"].content["application/x-ndjson"].example;
    expect(line).toMatchObject({
      seq: 0,
      type: "agent.session_started",
      data: { agent: "assistant", sessionId: "session_abc123" },
    });
    expect(line.turnSeq).toBeUndefined();
    const history =
      presented.paths["/v1/agent-sessions"].get.responses["200"].content["application/json"].example
        .sessions[0];
    expect(history.title).toBe("Review the Acme renewal");
  });

  it("samples the token Approve on a payment returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const mint = presented.paths["/v1/agent-sessions/{id}/approvals/{approvalId}/token"].post;
    expect(mint.summary).toBe("Approve payment");
    expect(mint.description).toContain("posts no body");
    expect(mint.description).toContain("2026-09-02T15:10:00Z");
    expect(mint.requestBody).toBeUndefined();
    const token = mint.responses["200"].content["application/json"].example;
    expect(token).toEqual({
      approvalToken: "agt_example.signature",
      expiresAt: "2026-09-02T15:10:00Z",
      mfa: false,
    });
    const history =
      presented.paths["/v1/agent-sessions"].get.responses["200"].content["application/json"].example
        .sessions[0];
    expect(history.title).toBe("Review the Acme renewal");
  });

  it("samples the conversation a history row opens", () => {
    const presented = presentApiReferenceDocument(spec);
    const open = presented.paths["/v1/agent-sessions/{id}/events"].get;
    expect(open.summary).toBe("Open conversation");
    expect(open.description).toContain("Review the Acme renewal");
    expect(open.description).toContain("sends no cursor");
    expect(open.description).toContain("1000");
    const afterSeq = open.parameters.find((param: { name: string }) => param.name === "afterSeq");
    const limit = open.parameters.find((param: { name: string }) => param.name === "limit");
    expect(afterSeq.schema.example).toBeUndefined();
    expect(limit.schema.example).toBe(1000);
    const page = open.responses["200"].content["application/json"].example;
    expect(page.nextSeq).toBeUndefined();
    expect(page.events).toHaveLength(15);
    expect(page.events[0]).toEqual({
      seq: 0,
      type: "agent.session_started",
      data: { agent: "assistant", sessionId: "session_abc123" },
    });
    expect(page.events[1].data.input).toBe("Review the Acme renewal");
    expect(page.events[10].data.input).toBe("What is the next step?");
    expect(
      page.events
        .map((event: { type: string }) => event.type)
        .filter((type: string) => type === "agent.llm_call_completed"),
    ).toHaveLength(3);
    expect(JSON.stringify(page)).not.toContain("Review Acme");
    const history =
      presented.paths["/v1/agent-sessions"].get.responses["200"].content["application/json"].example
        .sessions[0];
    expect(history.title).toBe("Review the Acme renewal");
    expect(presented.components.schemas.AgentSessionEventsResponse.properties.nextSeq.example).toBe(
      500,
    );
  });

  it("samples the transcript a run opens", () => {
    const presented = presentApiReferenceDocument(spec);
    const open = presented.paths["/v1/background-tasks/{slug}/runs/{runId}/events"].get;
    expect(open.summary).toBe("Open the transcript");
    expect(open.description).toContain("sends no cursor");
    expect(open.description).toContain("API worker claimed the run.");
    const afterSeq = open.parameters.find((param: { name: string }) => param.name === "afterSeq");
    const runId = open.parameters.find((param: { name: string }) => param.name === "runId");
    expect(afterSeq.schema.example).toBeUndefined();
    expect(runId.schema.example).toBe("api-trigger-4a31958c-3a0a-4cb2-9361-ea563cd0477b");
    const page = open.responses["200"].content["application/json"].example;
    expect(page.nextSeq).toBeUndefined();
    expect(page.events).toEqual([
      {
        id: "c6227adb-924f-46f1-b324-1b10d080a661",
        seq: 0,
        type: "temporal.running",
        event: {
          message: "API worker claimed the run.",
          progress: 5,
          type: "temporal.running",
          workflowId:
            "background-task/user/daily-summary/api-trigger-4a31958c-3a0a-4cb2-9361-ea563cd0477b",
        },
        receivedAt: "2026-06-04T21:01:00Z",
      },
    ]);
    expect(presented.paths["/v1/background-tasks/{slug}/runs/{runId}/events"].post.summary).toBe(
      "Add run events",
    );
    expect(presented.components.schemas.BackgroundTaskRunEvent.properties.seq.example).toBe(1);
  });

  it("shows the HubSpot private app token Connect sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/connections/{name}/api-key"].post;
    expect(operation.summary).toBe("Connect HubSpot");
    expect(operation.description).toContain("private app token");
    expect(operation.description).not.toMatch(/\bslug\b|Temporal/);
    expect(operation.parameters[0].schema.example).toBe("hubspot");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      apiKey: "pat-test",
    });
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      connected: true,
    });
    expect(JSON.stringify(operation.requestBody.content["application/json"].example)).not.toContain(
      "example-vendor-key",
    );
  });

  it("shows the mailbox policy Save sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/revenue-workspaces/current/communication-policy/{sourceAccountId}"].put;
    expect(operation.summary).toBe("Save mailbox policy");
    expect(operation.description).toContain("leaves out the policy id");
    expect(operation.description).not.toMatch(/\bslug\b|Temporal/);
    expect(operation.parameters[0].schema.example).toBe("you@company.com");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      metadataVisibility: "workspace",
      shareSubject: true,
      shareBody: false,
      shareAttachments: false,
      signatureEnrichment: true,
      modelContactExtraction: true,
      retentionDays: 540,
    });
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      id: "db8dfa9b-a7b2-46ea-982c-622a914c00e5",
      sourceAccountId: "you@company.com",
      metadataVisibility: "workspace",
      shareSubject: true,
      shareBody: false,
      shareAttachments: false,
      signatureEnrichment: true,
      modelContactExtraction: true,
      retentionDays: 540,
      version: 2,
    });
  });

  it("shows the Markdown file Export record downloads", () => {
    const commitmentId = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/commitments/{commitmentId}/export"].get;
    expect(operation.summary).toBe("Export record");
    expect(operation.description).toContain("format md");
    expect(operation.parameters.find((param) => param.name === "format")?.schema.example).toBe(
      "md",
    );
    expect(
      operation.parameters.find((param) => param.name === "commitmentId")?.schema.example,
    ).toBe(commitmentId);
    const markdown = operation.responses["200"].content["text/markdown"].example as string;
    expect(markdown).toContain("**We promised:** Migration live by the 14th");
    expect(markdown).toContain("| State | At risk |");
    expect(markdown).toContain("Confirmed in this workspace");
    expect(markdown).not.toContain("at_risk");
    expect(markdown).not.toContain("internally_confirmed");
  });

  it("shows the Gmail message View original email loads", () => {
    const actionId = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/source-body"].get;
    expect(operation.summary).toBe("View original email");
    expect(operation.description).toContain("only the action id");
    expect(operation.parameters.find((param) => param.name === "actionId")?.schema.example).toBe(
      actionId,
    );
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toEqual({ body: "Could you circle back this month? July works for us." });
    expect(JSON.stringify(example)).not.toContain("following up on the proposal");
    expect(JSON.stringify(example)).not.toContain("Hi Jordan");
  });

  it("shows the linked workspace Link workspace stores", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-workspaces/link"].post;
    expect(operation.summary).toBe("Link workspace");
    expect(operation.description).toContain("sending workspace id");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      outboundOrganizationId: "org_1",
      outboundWorkspaceId: "ws_1",
    });
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      id: "0b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      mode: "linked",
      status: "active",
      outboundOrganizationId: "org_1",
      outboundWorkspaceId: "ws_1",
      lastVerifiedAt: "2026-07-12T12:00:00Z",
      preflightAvailable: true,
    });
    expect(presented.components.schemas.RevenueWorkspace.properties.mode.example).toBe("local");
  });

  it("shows the mail Search mail ranks for the typed words", () => {
    const presented = presentApiReferenceDocument(spec);
    const search = presented.paths["/v1/revenue-search"].get;
    expect(search.summary).toBe("Search mail");
    expect(search.description).toContain("words typed in the palette");
    expect(search.description).not.toMatch(/RFC|Layer-2/);
    expect(search.parameters?.[0]?.schema?.example).toBe("launch promise");
    const example = search.responses["200"].content["application/json"].example as {
      available: boolean;
      matches: Array<{
        subject: string;
        classification: string;
        counterparty: string;
        threadId: string;
      }>;
    };
    expect(example.available).toBe(true);
    expect(example.matches[0]).toMatchObject({
      threadId: "tc",
      subject: "Launch plan",
      counterparty: "client@example.org",
      classification: "other",
      summary: "An explicit promise in this message needs confirmation.",
      score: 0.9130171833009648,
    });
    expect(JSON.stringify(example)).not.toContain("thr_01");
    expect(JSON.stringify(example)).not.toContain("Proposal follow-up");
    expect(JSON.stringify(example)).not.toContain('"commitment"');
  });

  it("shows the person People loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const people = presented.paths["/v1/relationship-persons"].get;
    expect(people.summary).toBe("People");
    expect(people.description).toContain("first 500 people");
    expect(people.parameters?.[0]?.schema?.example).toBe(500);
    const example = people.responses["200"].content["application/json"].example as {
      hasMore: boolean;
      persons: Array<{
        displayName: string;
        primaryEmail: string;
        title: string;
        participantRoles: string[];
      }>;
    };
    expect(example.hasMore).toBe(false);
    expect(example.persons[0]).toMatchObject({
      id: "ab8dfa9b-a7b2-46ea-982c-622a914c00e5",
      displayName: "Sarah Chen",
      primaryEmail: "sarah@acme.example",
      title: "VP Engineering",
      seniority: "vp",
      orgName: "Acme",
      orgDomain: "acme.example",
      department: "Engineering",
      location: "San Francisco",
      linkedinUrl: "https://www.linkedin.com/in/sarahchen",
      timezone: "America/Los_Angeles",
      locale: "en-US",
      status: "active",
      employmentStatus: "unknown",
      relationshipCount: 1,
      participantRoles: ["champion"],
      attributesVersion: 1,
    });
    expect(example.persons[0]).not.toHaveProperty("phone");
  });

  it("shows the profile Open person loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const profile = presented.paths["/v1/relationship-persons/{personId}/attributes"].get;
    expect(profile.summary).toBe("Open person");
    expect(profile.description).toContain("sends only the person id");
    expect(profile.parameters?.[0]?.schema?.example).toBe("ab8dfa9b-a7b2-46ea-982c-622a914c00e5");
    const example = profile.responses["200"].content["application/json"].example as {
      attributes: Array<{ dimension: string; value: string; reason: string }>;
    };
    expect(example.attributes.map((row) => row.dimension)).toEqual([
      "alias",
      "display_name",
      "org_domain",
      "org_name",
      "title",
      "location",
    ]);
    expect(example.attributes[5]).toMatchObject({
      dimension: "location",
      value: "San Francisco",
      sourceType: "external_research",
      source: "web",
      citations: [
        {
          title: "Sarah Chen",
          url: "https://www.linkedin.com/in/sarahchen",
          excerpts: ["VP Engineering in San Francisco"],
        },
      ],
    });
    expect(example.attributes[4]).toMatchObject({
      id: "b58dfa9b-a7b2-46ea-982c-622a914c00e5",
      dimension: "title",
      value: "VP Engineering",
      source: "hubspot",
      extractor: "crm_field",
      reason: "Title supplied by the source record.",
      confidence: 0.7,
    });
    expect(JSON.stringify(example)).not.toContain("phone");
  });

  it("shows the sent message Mail and meetings loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/communication-timeline"]?.get;
    expect(operation?.summary).toBe("Mail and meetings");
    expect(operation?.description).toContain("asks for the first 50");
    expect(operation?.description).toContain("Follow up");
    const limit = operation?.parameters?.find((parameter) => parameter.name === "limit");
    expect(limit?.schema).toMatchObject({ example: 50 });
    const before = operation?.parameters?.find((parameter) => parameter.name === "before");
    expect(before?.schema).not.toHaveProperty("example");
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example as {
      hasMore?: boolean;
      nextBefore?: string;
      items?: Array<{
        direction?: string;
        subject?: string;
        bodyLocked?: boolean;
        access?: { reason?: string };
      }>;
    };
    expect(example.hasMore).toBe(false);
    expect(example.nextBefore).toBeUndefined();
    expect(example.items?.[0]).toMatchObject({
      direction: "outbound",
      subject: "Follow up",
      bodyLocked: false,
      access: { reason: "mailbox_owner", body: true },
    });
    expect(JSON.stringify(example)).not.toContain("llm_settle");
    expect(JSON.stringify(example)).not.toContain('"inbound"');
  });

  it("shows the activity a company loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships/{relationshipId}/timeline"]?.get;
    expect(operation?.summary).toBe("Activity");
    expect(operation?.description).toContain("asks for the first 50");
    expect(operation?.description).toContain("Slack");
    const limit = operation?.parameters?.find((parameter) => parameter.name === "limit");
    expect(limit?.schema).toMatchObject({ example: 50 });
    const before = operation?.parameters?.find((parameter) => parameter.name === "before");
    expect(before?.schema).not.toHaveProperty("example");
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example as {
      hasMore?: boolean;
      nextBefore?: string;
      observations?: Array<{ source?: string; summary?: string; eventType?: string }>;
    };
    expect(example.hasMore).toBe(false);
    expect(example.nextBefore).toBeUndefined();
    expect(example.observations?.map((item) => item.source)).toEqual([
      "slack",
      "calendar",
      "gmail",
      "hubspot",
    ]);
    expect(example.observations?.[2]).toMatchObject({
      eventType: "commitment_created",
      summary: "We promised the security packet by July 22.",
    });
    expect(JSON.stringify(example)).not.toContain("message-123");
  });

  it("samples the account Retry sync queues", () => {
    const presented = presentApiReferenceDocument(spec);
    const op = presented.paths["/v1/relationship-sources/{source}/resync"].post;
    expect(op.summary).toBe("Resync a source");
    expect(op.description).toBe(
      "Retry sync, Refresh now, and Resync post the connected account and queue a fresh read. The stored answer marks that account backfilling, with the read queued and completeness rebuilding.",
    );
    expect(op.requestBody.content["application/json"].example).toEqual({
      sourceAccountId: "owner@example.com",
    });
    const queued = op.responses["202"].content["application/json"].example;
    expect(queued).toMatchObject({
      connectionId: "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      source: "google",
      sourceAccountId: "owner@example.com",
      status: "backfilling",
      backfillPhase: "queued",
      completeness: "rebuilding",
      backfillCompleted: 0,
      backfillTotal: 0,
      retryCount: 0,
      missingScopes: [],
    });
    expect(JSON.stringify(queued)).not.toContain("me@company.com");
    expect(JSON.stringify(queued)).not.toContain('"status":"active"');
    expect(JSON.stringify(queued)).not.toContain('"backfillPhase":"live"');
  });

  it("samples the snapshot What changed loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const op = presented.paths["/v1/relationships/{relationshipId}/changes"].get;
    expect(op.summary).toBe("What changed");
    expect(op.description).toBe(
      "What changed loads when a company opens. The request asks for the two newest snapshots and sends no older-page offset. Acme has one snapshot: engagement, health, and lifecycle changed together.",
    );
    const limit = op.parameters.find((parameter) => parameter.name === "limit");
    const offset = op.parameters.find((parameter) => parameter.name === "offset");
    expect(limit.schema.example).toBe(2);
    expect(offset.schema.example).toBeUndefined();
    const page = op.responses["200"].content["application/json"].example;
    expect(page.hasMore).toBe(false);
    expect(page.snapshots).toHaveLength(1);
    expect(page.snapshots[0]).toMatchObject({
      id: "c18dfa9b-a7b2-46ea-982c-622a914c00e5",
      version: 1,
      projectorVersion: 2,
      stateHash: "sha256:61dd3377d3854c6f9c104af050ad3f0f87ff6cdd1c3458c17541cbc1e87fc887",
      changedDimensions: ["engagement", "health", "lifecycle"],
      state: {
        lifecycle: "evaluation",
        engagement: "declining",
        health: "needs_attention",
        stateReason:
          "Champion engagement declined after pricing. Security review has no meeting. CRM stage is evaluation.",
        stateVersion: 1,
      },
    });
    expect(JSON.stringify(page)).not.toContain("state_abc123");
    expect(JSON.stringify(page)).not.toContain("assertion-123");
  });

  it("samples the activity Open the original detail loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/evidence/{evidenceId}"].get;
    expect(operation.summary).toBe("Open the original detail");
    expect(operation.description).toBe(
      "Open the original detail loads when an activity row opens. The request names that activity on Acme. The Gmail promise stores no provider body, and the response is that activity with a null payload.",
    );
    const company = operation.parameters.find((parameter) => parameter.name === "relationshipId");
    const activity = operation.parameters.find((parameter) => parameter.name === "evidenceId");
    expect(company.schema.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(activity.schema.example).toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    const detail = operation.responses["200"].content["application/json"].example;
    expect(detail.payload).toBeNull();
    expect(detail.observation).toMatchObject({
      id: "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      source: "gmail",
      externalId: "acme-security-promise",
      eventType: "commitment_created",
      occurredAt: "2026-07-18T15:00:00Z",
      summary: "We promised the security packet by July 22.",
      contentHash: "e57461826e791945b63630c2de4c026adb4459066470014cf50aadde9b6aafca",
      normalizedFacts: { adapter: "gmail" },
    });
    expect(JSON.stringify(detail)).not.toContain("message-123");
    expect(JSON.stringify(detail)).not.toContain("ab12cd34");
  });

  it("samples the company All companies loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships"].get;
    expect(operation.summary).toBe("All companies");
    expect(operation.description).toBe(
      "All companies loads the directory. The request sends no search and no health, stage, or older-page offset. Acme is the one company: evaluation, declining engagement, and health that needs attention. The next action is to confirm the security review owner. The LinkedIn column opens the Acme company page. The category is Artificial intelligence.",
    );
    for (const parameter of operation.parameters) {
      expect(parameter.schema.example).toBeUndefined();
    }
    const page = operation.responses["200"].content["application/json"].example;
    expect(page.hasMore).toBe(false);
    expect(page.relationships).toHaveLength(1);
    expect(page.relationships[0]).toMatchObject({
      id: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      kind: "company",
      displayName: "Acme",
      accountDomain: "acme.com",
      peopleCount: 1,
      emailThreadCount: 0,
      commitmentCount: 0,
      lifecycle: "evaluation",
      engagement: "declining",
      health: "needs_attention",
      nextAction: "Confirm the security review owner.",
      linkedinUrl: "https://www.linkedin.com/company/acme",
      categories: ["Artificial intelligence"],
      stateVersion: 1,
      stateHash: "sha256:61dd3377d3854c6f9c104af050ad3f0f87ff6cdd1c3458c17541cbc1e87fc887",
    });
    expect(JSON.stringify(page)).not.toContain("Jordan Buyer");
    expect(JSON.stringify(page)).not.toContain("sha256:ab12");
    expect(presented.paths["/v1/relationships"].post.operationId).toBe("createRelationship");
  });

  it("samples the counts Impact loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-impact"].get;
    expect(operation.summary).toBe("Impact");
    expect(operation.description).toBe(
      "Impact loads the home counts. The request sends no filter. Overdue promises, open recovery, and companies at risk are zero, and there is no reply rate or meeting rate yet.",
    );
    expect(operation.parameters).toBeUndefined();
    const impact = operation.responses["200"].content["application/json"].example;
    expect(impact).toMatchObject({
      surfaced: 0,
      open: 0,
      openTasks: 0,
      relationships: 0,
      atRiskRelationships: 0,
      overdueCommitments: 0,
      replyRate: null,
      meetingRate: null,
      outcomes: {},
      byDetector: [],
      riskReasons: [],
    });
    expect(JSON.stringify(impact)).not.toContain("42");
    expect(JSON.stringify(impact)).not.toContain("0.38");
    expect(JSON.stringify(impact)).not.toContain("unanswered_proposal");
  });

  it("samples the page Notes loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/workspace-notes"].get;
    expect(operation.summary).toBe("Notes");
    expect(operation.description).toBe(
      "Notes loads the newest page. The request asks for 50 notes and does not ask for an older page. This workspace has no company note, so the page is empty.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map((parameter: { name: string; schema?: { example?: unknown } }) => [
        parameter.name,
        parameter.schema?.example,
      ]),
    );
    expect(examples).toMatchObject({ limit: 50 });
    expect(examples.offset).toBeUndefined();
    expect(examples.order).toBeUndefined();
    const page = operation.responses["200"].content["application/json"].example;
    expect(page).toEqual({ hasMore: false, notes: [] });
    expect(JSON.stringify(page)).not.toContain("Cedar Notes");
    expect(JSON.stringify(page)).not.toContain("note-1");
    expect(JSON.stringify(page)).not.toContain("Renewal context");
  });

  it("samples the page Audits loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-leak-scans"].get;
    expect(operation.summary).toBe("Audits");
    expect(operation.description).toBe(
      "Audits loads the newest page. The request asks for 10 audits and does not ask for an older page. This workspace has no audit, so the page is empty.",
    );
    expect(presented.paths["/v1/revenue-leak-scans"].post.operationId).toBe("startRevenueLeakScan");
    const examples = Object.fromEntries(
      operation.parameters.map((parameter: { name: string; schema?: { example?: unknown } }) => [
        parameter.name,
        parameter.schema?.example,
      ]),
    );
    expect(examples).toMatchObject({ limit: 10 });
    expect(examples.offset).toBeUndefined();
    const page = operation.responses["200"].content["application/json"].example;
    expect(page).toEqual({ hasMore: false, scans: [] });
    expect(JSON.stringify(page)).not.toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(JSON.stringify(page)).not.toContain("threadsSeen");
  });

  it("samples the page Review possible duplicates loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-identity-candidates"].get;
    expect(operation.summary).toBe("Review possible duplicates");
    expect(operation.description).toBe(
      "Review possible duplicates loads the pending page. The request asks for pending duplicates, 50 at a time, and it does not ask for an older page. This workspace has no pending duplicate, so the page is empty.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map(
        (parameter: { name: string; schema?: { example?: unknown }; example?: unknown }) => [
          parameter.name,
          parameter.example ?? parameter.schema?.example,
        ],
      ),
    );
    expect(examples).toMatchObject({ status: "pending", limit: 50 });
    expect(examples.offset).toBeUndefined();
    expect(examples.source).toBeUndefined();
    expect(examples.relationshipId).toBeUndefined();
    const page = operation.responses["200"].content["application/json"].example;
    expect(page).toEqual({ candidates: [], hasMore: false });
    expect(JSON.stringify(page)).not.toContain("hubspot");
    expect(JSON.stringify(page)).not.toContain("other@example.com");
    expect(JSON.stringify(page)).not.toContain("Confirmed duplicate");
  });

  it("samples the page What we owe loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/commitments"].get;
    expect(operation.summary).toBe("What we owe");
    expect(operation.description).toBe(
      "What we owe loads promises we made that are still open. The request asks for promised by us, open and at risk, 200 at a time, and it does not ask for an older page. This workspace has no open promise we made, so the page is empty.",
    );
    expect(presented.paths["/v1/commitments/{commitmentId}/export"].get.operationId).toBe(
      "exportCommitment",
    );
    const examples = Object.fromEntries(
      operation.parameters.map(
        (parameter: { name: string; schema?: { example?: unknown }; example?: unknown }) => [
          parameter.name,
          parameter.example ?? parameter.schema?.example,
        ],
      ),
    );
    expect(examples).toMatchObject({
      direction: "promised_by_me",
      state: "open,at_risk",
      limit: 200,
    });
    expect(examples.offset).toBeUndefined();
    expect(examples.includeCandidates).toBeUndefined();
    expect(examples.dueBefore).toBeUndefined();
    const page = operation.responses["200"].content["application/json"].example;
    expect(page).toEqual({ commitments: [], hasMore: false });
    expect(JSON.stringify(page)).not.toContain("Acme");
    expect(JSON.stringify(page)).not.toContain("Migration live");
  });

  it("samples the page Attention queue loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-attention"].get;
    expect(operation.summary).toBe("Attention queue");
    expect(operation.description).toBe(
      "Attention queue loads the open page. The request asks for open items, 50 at a time, and it does not ask for an older page. This workspace has no open company in the queue, so the page is empty.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map(
        (parameter: { name: string; schema?: { example?: unknown }; example?: unknown }) => [
          parameter.name,
          parameter.example ?? parameter.schema?.example,
        ],
      ),
    );
    expect(examples).toMatchObject({ status: "open", limit: 50 });
    expect(examples.offset).toBeUndefined();
    const page = operation.responses["200"].content["application/json"].example;
    expect(page).toEqual({
      asOf: "2026-07-31T14:00:00Z",
      contractVersion: "relationship-attention.v1",
      hasMore: false,
      items: [],
    });
    expect(JSON.stringify(page)).not.toContain("overdue by two days");
    expect(JSON.stringify(page)).not.toContain("123e4567-e89b-12d3-a456-426614174000");
  });

  it("samples the page Impact loads for the weekly digest", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-digest"].get;
    expect(operation.summary).toBe("Weekly digest");
    expect(operation.description).toBe(
      "Impact loads the weekly digest. The request sends no filter. This workspace has no open loop, so the highlight list is empty and every count is zero.",
    );
    expect(operation.parameters).toBeUndefined();
    const digest = operation.responses["200"].content["application/json"].example;
    expect(digest).toEqual({
      generatedAt: "2026-07-23T09:00:00Z",
      handled: 0,
      meetingsBooked: 0,
      openCount: 0,
      replied: 0,
      top: [],
    });
    expect(JSON.stringify(digest)).not.toContain("buyer@example.com");
    expect(JSON.stringify(digest)).not.toContain("Unanswered proposal");
  });

  it("samples the page Agent approvals loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/action-proposals"].get;
    expect(operation.summary).toBe("Agent approvals");
    expect(operation.description).toBe(
      "Agent approvals loads the pending queue. The request asks for pending proposals. This workspace has no pending proposal, so the page is empty.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "status",
        example: "pending",
        schema: expect.objectContaining({ example: "pending" }),
      }),
    ]);
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      proposals: [],
    });
  });

  it("samples the page Protected or blocked addresses loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/revenue-workspaces/current/communication-privacy-rules"].get;
    expect(operation.summary).toBe("Protected or blocked addresses");
    expect(operation.description).toBe(
      "Protected or blocked addresses loads this workspace's list. The request sends no filter. This workspace has no protected or blocked address, so the list is empty.",
    );
    expect(operation.parameters).toBeUndefined();
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      rules: [],
    });
  });

  it("samples the page Company graph loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships/graph"].get;
    expect(operation.summary).toBe("Company graph");
    expect(operation.description).toBe(
      "Company graph loads the portfolio. The request asks for the portfolio at depth 2 and does not ask for an earlier moment or an older page. This workspace has no company, so the graph is empty.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map(
        (parameter: { name: string; example?: unknown; schema?: { example?: unknown } }) => [
          parameter.name,
          parameter.example ?? parameter.schema?.example,
        ],
      ),
    );
    expect(examples.scope).toBe("portfolio");
    expect(examples.depth).toBe(2);
    expect(examples.relationshipId).toBeUndefined();
    expect(examples.asOf).toBeUndefined();
    expect(examples.offset).toBeUndefined();
    expect(examples.observationOffset).toBeUndefined();
    const graph = operation.responses["200"].content["application/json"].example;
    expect(graph).toEqual({
      asOf: "2026-08-01T14:00:00Z",
      contractVersion: "2026-08-01",
      depth: 2,
      edges: [],
      generatedAt: "2026-08-01T14:00:00Z",
      historical: false,
      nodes: [],
      permissions: {
        canApprove: true,
        canContribute: true,
        canExecute: true,
        canSaveViews: true,
        canView: true,
      },
      scope: "portfolio",
    });
    expect(JSON.stringify(graph)).not.toContain("hasMore");
    expect(JSON.stringify(graph)).not.toContain("9c8dfa9b");
  });

  it("samples the page Templates loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/background-task-templates"]?.get;
    expect(operation?.summary).toBe("Templates");
    expect(operation?.description).toBe(
      "Templates loads the built-in list. The request sends no filter. The list is every workflow you can start from.",
    );
    expect(operation?.parameters).toBeUndefined();
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example as {
      templates?: Array<{
        name?: string;
        slug?: string;
        instructions?: string;
        description?: string;
      }>;
    };
    expect(example.templates).toHaveLength(10);
    expect(example.templates?.[0]?.name).toBe("Relationship Refresh");
    const inbox = example.templates?.find((template) => template.slug === "inbox-digest");
    expect(inbox?.instructions).toContain("concrete next actions");
    const encoded = JSON.stringify(example);
    expect(encoded).not.toContain("produce a markdown digest.");
    expect(encoded).not.toContain("report artifact");
    const one = presented.paths["/v1/background-task-templates/{templateSlug}"]?.get?.responses?.[
      "200"
    ]?.content?.["application/json"]?.example as { instructions?: string };
    expect(one.instructions).toBe(
      "Review recent important Gmail messages and produce a markdown digest.",
    );
  });

  it("samples the page Gmail and Google Calendar loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/google-oauth"]?.get;
    expect(operation?.summary).toBe("Gmail and Google Calendar");
    expect(operation?.description).toBe(
      "Gmail and Google Calendar loads this account's connection. The request sends no filter. This workspace has not connected Google, so the account list is empty.",
    );
    expect(operation?.parameters).toBeUndefined();
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example as {
      connected?: boolean;
      accounts?: unknown[];
    };
    expect(example.connected).toBe(false);
    expect(example.accounts).toEqual([]);
    expect(JSON.stringify(example)).not.toContain("owner@example.com");
    expect(presented.paths["/v1/google-oauth"]?.delete?.operationId).toBe("disconnectGoogle");
  });

  it("samples the page Connections loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/connectors"]?.get;
    expect(operation?.summary).toBe("Connections");
    expect(operation?.description).toBe(
      "Connections loads the catalog. The request sends no filter. This workspace has not connected any of them, so every one is disconnected.",
    );
    expect(operation?.parameters).toBeUndefined();
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example as {
      connectors?: Array<{
        name?: string;
        connected?: boolean;
        displayName?: string;
        authType?: string;
        mcpUrl?: string;
      }>;
    };
    expect(example.connectors).toHaveLength(11);
    expect(example.connectors?.[0]).toMatchObject({ name: "canvas", connected: false });
    expect(example.connectors?.every((connector) => connector.connected === false)).toBe(true);
    const hubspot = example.connectors?.find((connector) => connector.name === "hubspot");
    expect(hubspot).toMatchObject({ displayName: "HubSpot", authType: "api_key", mcpUrl: "" });
    const encoded = JSON.stringify(example);
    expect(encoded).not.toContain("connectedAt");
    expect(encoded).not.toContain("invoice-context");
  });

  it("samples the page AI model loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/llm/models"]?.get;
    expect(operation?.summary).toBe("AI model");
    expect(operation?.description).toBe(
      "AI model loads the priced list. The request sends no filter. The list is every model this workspace can choose, in order.",
    );
    expect(operation?.parameters).toBeUndefined();
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example as {
      data?: Array<{ id?: string }>;
    };
    expect(example.data).toHaveLength(10);
    expect(example.data?.[0]?.id).toBe("anthropic/claude-haiku-4-5");
    expect(example.data?.map((row) => row.id)).toEqual(
      [...(example.data ?? []).map((row) => row.id)].sort(),
    );
    expect(
      presented.paths["/v1/llm/chat/completions"]?.post?.requestBody?.content?.["application/json"]
        ?.example,
    ).toMatchObject({
      model: "openai/gpt-4.1-mini",
    });
  });

  it("samples the page Reusable note templates loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/console/resources"].get;
    expect(operation.summary).toBe("Reusable note templates");
    expect(operation.description).toBe(
      "Reusable note templates loads the first page. The request asks for note templates, one hundred at a time, starting at the beginning. This workspace has no template, so the page is empty.",
    );
    expect(operation.operationId).toBe("listConsoleResources");
    const parameters = Object.fromEntries(
      (operation.parameters ?? []).map((parameter) => [parameter.name, parameter]),
    );
    expect(parameters.kind.example).toBe("note_template");
    expect(parameters.limit.example).toBe(100);
    expect(parameters.offset.example).toBe(0);
    expect(operation.responses["200"].description).toBe("Empty template page.");
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      hasMore: false,
      limit: 100,
      offset: 0,
      resources: [],
    });
    expect(presented.paths["/v1/console/resources"].post.operationId).toBe("createConsoleResource");
  });

  it("samples the page Upgrade to Pro sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/billing/checkout-session"].post;
    expect(operation.summary).toBe("Upgrade to Pro");
    expect(operation.description).toBe(
      "Upgrade to Pro opens checkout. The request asks for the Pro plan. This server has not configured checkout, so the request is refused.",
    );
    expect(operation.operationId).toBe("createCheckoutSession");
    expect(operation.requestBody.content["application/json"].example).toEqual({ plan: "pro" });
    expect(operation.responses["200"].content["application/json"].example).toBeUndefined();
    expect(operation.responses["502"].description).toBe("Checkout is not configured.");
    expect(operation.responses["502"].content["application/problem+json"].example).toEqual({
      type: "https://api.rowboat.dev/problems/provider_unconfigured",
      title: "Bad Gateway",
      status: 502,
      detail: "Stripe checkout is not configured",
      code: "provider_unconfigured",
      requestId: "req-abc123",
      retryable: true,
    });
  });

  it("samples the page Connect Google sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/google-oauth/start"].post;
    expect(operation.summary).toBe("Connect Google");
    expect(operation.description).toBe(
      "Connect Google starts Gmail and Calendar authorization. The request asks for commitments, a web return, and the connections page. This server has not configured Google sign-in, so the request is refused.",
    );
    expect(operation.operationId).toBe("startGoogleOAuth");
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters.map((parameter) => [parameter.name, parameter.example])).toEqual([
      ["profile", "commitments"],
      ["return", "web"],
      ["return_path", "/app/settings?settings=connections"],
    ]);
    expect(operation.responses["200"].content["application/json"].example).toBeUndefined();
    expect(operation.responses["502"].description).toBe("Google sign-in is not configured.");
    expect(operation.responses["502"].content["text/html"].example).toBe(
      `<!doctype html><meta charset=utf-8><title>Oppulence</title><p style="font:14px system-ui;margin:3rem">Google sign-in isn't configured on the server yet.</p>`,
    );
    expect(JSON.stringify(operation)).not.toContain("accounts.google.com");
  });

  it("samples the cloud runs the Runs page loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/background-task-runs"].get;
    expect(operation.summary).toBe("Runs");
    expect(operation.description).toBe(
      "The Runs page loads the first 50 cloud runs. Each run on that page failed on a schedule.",
    );
    const limit = operation.parameters.find((parameter) => parameter.name === "limit");
    expect(limit.example).toBe(50);
    expect(limit.schema.example).toBe(50);
    for (const name of ["status", "executor", "cursor", "slug"]) {
      const parameter = operation.parameters.find((item) => item.name === name);
      expect(parameter.example).toBeUndefined();
      expect(parameter.schema.enum).toBeUndefined();
      expect(parameter.schema.example).toBeUndefined();
    }
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      runs: [
        {
          attempt: 1,
          errorCode: "llm_call_failed",
          executor: "api",
          id: "77f5e632-a841-4557-a8e4-9b8f0d207ff4",
          progressPercent: 10,
          revision: 5,
          runId: "sched-temporal-77f5e632-a841-4557-a8e4-9b8f0d207ff4",
          slug: "oppulence-relationship-refresh",
          status: "failed",
          trigger: "cron",
        },
      ],
    });
  });

  it("samples the maintained workflows the Workflows page loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/background-tasks"].get;
    expect(operation.summary).toBe("Workflows");
    expect(operation.description).toBe(
      "The Workflows page loads the six maintained cloud workflows for the signed-in person. Each one is live and starts on its schedule.",
    );
    expect(operation.parameters).toBeUndefined();
    const tasks = operation.responses["200"].content["application/json"].example.tasks;
    expect(
      tasks.map((task: { slug: string; name: string; executionTarget: string }) => [
        task.slug,
        task.name,
        task.executionTarget,
      ]),
    ).toEqual([
      ["oppulence-attention-monitor", "Attention Monitor", "api"],
      ["oppulence-connector-health-repair", "Connector Health and Repair", "api"],
      ["oppulence-meeting-pre-brief", "Meeting Pre-Brief", "api"],
      ["oppulence-post-meeting-processor", "Post-Meeting Processor", "api"],
      ["oppulence-recommendation-review", "Recommendation Review", "api"],
      ["oppulence-relationship-refresh", "Relationship Refresh", "api"],
    ]);
    expect(
      tasks.every(
        (task: { active: boolean; systemManaged: boolean; scheduleSyncState: string }) =>
          task.active && task.systemManaged && task.scheduleSyncState === "current",
      ),
    ).toBe(true);
    expect(JSON.stringify(operation.responses["200"])).not.toContain("daily-summary");
  });

  it("samples the workflows the Workflows page installs", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/background-tasks/first-party/ensure"].post;
    expect(operation.summary).toBe("Install maintained workflows");
    expect(operation.description).toBe(
      "Installs or updates the maintained workflows for the signed-in person. Paused workflows stay paused.",
    );
    expect(operation.parameters).toBeUndefined();
    expect(operation.requestBody).toBeUndefined();
    const tasks = operation.responses["200"].content["application/json"].example.tasks;
    expect(
      tasks.map((task: { slug: string; executionTarget: string; active: boolean }) => [
        task.slug,
        task.executionTarget,
        task.active,
      ]),
    ).toEqual([
      ["oppulence-relationship-refresh", "api", true],
      ["oppulence-attention-monitor", "api", true],
      ["oppulence-meeting-pre-brief", "api", true],
      ["oppulence-post-meeting-processor", "api", true],
      ["oppulence-recommendation-review", "api", true],
      ["oppulence-connector-health-repair", "api", true],
    ]);
    expect(JSON.stringify(operation.responses["200"])).not.toContain("daily-summary");
  });

  it("samples the cloud run the Runs page opens", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/background-tasks/{slug}/runs/{runId}"].get;
    expect(operation.summary).toBe("Get a run");
    expect(operation.description).toBe("Gets one workflow run, including its progress.");
    expect(
      operation.parameters.map((parameter: { name: string; example: string }) => [
        parameter.name,
        parameter.example,
      ]),
    ).toEqual([
      ["slug", "oppulence-relationship-refresh"],
      ["runId", "sched-temporal-77f5e632-a841-4557-a8e4-9b8f0d207ff4"],
    ]);
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      id: "77f5e632-a841-4557-a8e4-9b8f0d207ff4",
      slug: "oppulence-relationship-refresh",
      status: "failed",
      executor: "api",
      trigger: "cron",
      errorCode: "llm_call_failed",
    });
    expect(JSON.stringify(example)).not.toContain("daily-summary");
    expect(
      presented.paths["/v1/background-tasks/{slug}/runs/{runId}"].patch.responses["200"].content[
        "application/json"
      ].example.slug,
    ).toBe("daily-summary");
  });

  it("samples the workflow the editor removes", () => {
    const presented = presentApiReferenceDocument(spec);
    const item = presented.paths["/v1/background-tasks/{slug}"];
    const operation = item.delete;
    expect(operation.summary).toBe("Delete a background task");
    expect(operation.description).toBe(
      "Deletes the background task and its note, runs, and run events after checking the current revision.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(
      operation.parameters.map((parameter: { name: string; example: string | number }) => [
        parameter.name,
        parameter.example,
      ]),
    ).toEqual([
      ["slug", "follow-up-when-a-promise-slips"],
      ["revision", 1],
    ]);
    expect(operation.responses["204"].description).toBe("Background task deleted.");
    expect(item.get.responses["200"].content["application/json"].example.slug).toBe(
      "daily-summary",
    );
  });

  it("samples the company the sheet opens", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships/{relationshipId}"].get;
    const companyID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(operation.summary).toBe("Open a company");
    expect(operation.description).toBe(
      "The company sheet loads one company. The request sends that company id and no query. Acme comes back with its people, email threads, and promises. The description says it builds AI infrastructure for customer operations. Each detail came from a connected source. The email is avery@acme.com.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "relationshipId",
        example: companyID,
        schema: expect.objectContaining({ example: companyID }),
      }),
    ]);
    const example = operation.responses["200"].content["application/json"].example;
    expect(example.relationship).toMatchObject({
      id: companyID,
      displayName: "Acme",
      accountDomain: "acme.com",
      primaryEmail: "avery@acme.com",
      health: "needs_attention",
      lifecycle: "evaluation",
      companyDescription: "Builds AI infrastructure for customer operations.",
      peopleCount: 1,
      emailThreadCount: 0,
      commitmentCount: 0,
    });
    expect(example.emailThreads).toEqual([]);
    expect(example.participants).toEqual([
      expect.objectContaining({
        email: "avery@acme.com",
        role: "champion",
        displayName: "Avery Chen",
        personId: "aa8dfa9b-a7b2-46ea-982c-622a914c00e5",
        person: expect.objectContaining({
          id: "aa8dfa9b-a7b2-46ea-982c-622a914c00e5",
          displayName: "Avery Chen",
          title: "VP Operations",
          orgName: "Acme",
          seniority: "vp",
          location: "San Francisco",
          employmentStatus: "active",
        }),
      }),
    ]);
    expect(example.missionControl.stateVersion).toBe(1);
    expect(example.missionControl.evidence.lifecycle.supported).toBe(true);
    expect(example.missionControl.evidence.lifecycle.value).toBe("evaluation");
    for (const key of ["lifecycle", "health", "engagement", "sentiment"]) {
      expect(example.missionControl.evidence[key].authority).toBe("source_fact");
    }
  });

  it("samples the company Mark as reviewed sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships/{relationshipId}/acknowledgements"].post;
    const companyID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5";
    const stateHash = "sha256:454f195e2389d36fd49e5c9b9656b7b47a3629332a84eb570edf3fa5248851e1";
    expect(operation.summary).toBe("Mark as reviewed");
    expect(operation.description).toBe(
      "Mark as reviewed sends the company id and the state version and hash that company is showing. A stale review fails with 409.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "relationshipId",
        example: companyID,
        schema: expect.objectContaining({ example: companyID }),
      }),
    ]);
    expect(operation.requestBody.content["application/json"].example).toEqual({
      stateHash,
      stateVersion: 4,
    });
    expect(operation.responses["201"].content["application/json"].example).toMatchObject({
      id: "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      stateHash,
      stateVersion: 4,
      acknowledgedAt: "2026-07-31T14:00:00Z",
    });
    expect(JSON.stringify(operation.requestBody)).not.toContain('sha256:ab12"');
  });

  it("samples the conversation Correct sends", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/conversation-corrections"].post;
    const companyID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(operation.summary).toBe("Correct a reviewed conversation");
    expect(operation.description).toBe(
      "Correct sends the company id, the review item id, and the edited value. It always sends the focused-review reason.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "relationshipId",
        example: companyID,
        schema: expect.objectContaining({ example: companyID }),
      }),
    ]);
    expect(operation.requestBody.content["application/json"].example).toEqual({
      correctedValue: "Avery Chen",
      reason: "User corrected conversation evidence during focused review.",
      reviewItemId: "review:9abf3ca4a5e5eff1",
    });
    const response = operation.responses["201"].content["application/json"].example;
    expect(response.relationship.id).toBe(companyID);
    expect(response.intelligence.claims[0]).toMatchObject({
      speakerLabel: "Avery Chen",
      speakerConfidence: 1,
    });
    expect(response.intelligence.reviewItems.map((item: { id: string }) => item.id)).toEqual([
      "review:1fecc8d36f097595",
    ]);
    expect(JSON.stringify(operation.requestBody)).not.toContain("Avery was the speaker.");
    expect(JSON.stringify(operation.requestBody)).not.toContain("review:ab12");
  });

  it("samples the person New person adds", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-observations/batch"].post;
    expect(operation.summary).toBe("Ingest relationship observations");
    expect(operation.description).toBe(
      "New person sends the new person id, source user, and event person_added. The summary is that person's name followed by added by the user.",
    );
    const request = operation.requestBody.content["application/json"].example;
    expect(request.observations).toEqual([
      {
        eventType: "person_added",
        externalId: "1a8dfa9b-a7b2-46ea-982c-622a914c00e5",
        normalizedFacts: {},
        occurredAt: "2026-07-31T14:00:00Z",
        participants: [
          {
            displayName: "Jordan Buyer",
            email: "buyer@example.com",
            role: "contact",
          },
        ],
        relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
        source: "user",
        summary: "Jordan Buyer added by the user",
      },
    ]);
    const stored = operation.responses["201"].content["application/json"].example.results[0];
    expect(stored.observation).toMatchObject({
      contentHash: "a9ca4ce2e0cf65ff92d605d96c2f6ac649e3fadd83c402ac59e9c481e7aa67ef",
      eventType: "person_added",
      source: "user",
      sourceVersion: "1",
      summary: "Jordan Buyer added by the user",
    });
    expect(JSON.stringify(request)).not.toContain("message-123");
    expect(JSON.stringify(request)).not.toContain("commitment_created");
  });

  it("samples the action history History loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}/audit"]?.get;
    expect(operation?.summary).toBe("Get action history");
    expect(operation?.description).toBe(
      "History loads the action, its revisions, the policy decisions, and the outcomes.",
    );
    expect(operation?.parameters?.[0]?.example).toBe("1a8dfa9b-a7b2-46ea-982c-622a914c00e5");
    const example = operation?.responses?.["200"]?.content?.["application/json"]?.example;
    const hash = "sha256:878529bfd91ade7c21b79bcd0f4a2b80dfe46a6f6b41c2b82f58d196c1f10184";
    expect(example?.action).toMatchObject({
      id: "1a8dfa9b-a7b2-46ea-982c-622a914c00e5",
      relationshipName: "Jordan Buyer",
      actionType: "warm_follow_up",
      channel: "email",
      policyStatus: "passed",
      revisionHash: hash,
    });
    expect(example?.revisions?.[0]).toMatchObject({
      revision: 1,
      actionType: "warm_follow_up",
      channel: "email",
      revisionHash: hash,
    });
    expect(example?.outcomes?.[0]).toMatchObject({
      kind: "replied",
      source: "user",
      sourceEventId: "manual:replied:1783864800000",
    });
    expect(JSON.stringify(example)).not.toContain("sha256:ab12");
  });

  it("samples the support file Download support file saves", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-beta/diagnostics"].get;
    expect(operation.summary).toBe("Download support file");
    expect(operation.operationId).toBe("getRelationshipBetaDiagnostics");
    expect(operation.description).toBe(
      "Download support file saves the redacted support file for this workspace. Names, addresses, evidence, and secrets are left out.",
    );
    expect(operation.requestBody).toBeUndefined();
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      schemaVersion: "tfa-support-v1",
      generatedAt: "2026-08-01T15:00:00Z",
      workspaceRef: "workspace:sha256:1d811ce10de82ecb6ed8274b",
      sources: [
        {
          connectionRef: "connection:sha256:da73462ccdf527f07099a17f",
          source: "google",
          sourceAccountRef: "source-account:sha256:24021bb72aca268d3989017b",
          status: "degraded",
        },
      ],
      checks: expect.arrayContaining([
        expect.objectContaining({
          code: "source_health",
          status: "attention",
          count: 1,
        }),
      ]),
    });
    expect(JSON.stringify(example)).not.toContain("sha256:ab12");
    expect(JSON.stringify(example)).not.toContain("sha256:cd34");
  });

  it("samples the report Download the report saves", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-leak-scans/{scanId}/report"].get;
    expect(operation.summary).toBe("Download the report");
    expect(operation.operationId).toBe("getOpenPromisesReport");
    expect(operation.description).toBe(
      "Download the report saves this audit as Markdown. The request uses format md. The file names the open promises, who owes them, and the message that created each one.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters.find((param) => param.name === "scanId")?.example).toBe(
      "4d8dfa9b-a7b2-46ea-982c-622a914c00e5",
    );
    expect(operation.parameters.find((param) => param.name === "format")?.schema.example).toBe(
      "md",
    );
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      lookbackDays: 180,
      scanStatus: "completed",
      outboundCount: 1,
      inboundCount: 0,
      items: [
        {
          commitmentId: "8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
          account: "Acme",
          text: "Migration live by the 14th",
          state: "at_risk",
        },
      ],
    });
    const markdown = operation.responses["200"].content["text/markdown"].example as string;
    expect(markdown).toContain("# Open promises");
    expect(markdown).toContain("Promises from the last 180 days");
    expect(markdown).toContain("Migration live by the 14th");
    expect(markdown).toContain("We will have the migration live by the 14th.");
  });

  it("samples the plan Review the shared plan opens", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/public/mutual-action-plan"].get;
    expect(operation.summary).toBe("Review the shared plan");
    expect(operation.operationId).toBe("getPublicMutualActionPlan");
    expect(operation.description).toBe(
      "Review the shared plan opens this plan. The page shows the version and each item title.",
    );
    expect(operation.requestBody).toBeUndefined();
    const token = operation.parameters.find((param) => param.name === "X-Oppulence-Plan-Token");
    expect(token?.example).toBeUndefined();
    expect(token?.schema.example).toBeUndefined();
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      plan: {
        planId: "plan:5e8dfa9b-a7b2-46ea-982c-622a914c00e5",
        relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
        status: "shared",
        tokenState: "active",
        internalOwnerRef: "internal-owner",
        counterpartyRef: "counterparty",
        currentRevision: {
          version: 1,
          items: [
            {
              itemId: "item:8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
              title: "Migration live by the 14th",
              ownerParticipantRef: "plan-participant",
              dueAt: "2026-09-14T17:00:00Z",
              status: "open",
              evidenceRefs: null,
            },
          ],
        },
      },
    });
    expect(JSON.stringify(example)).not.toContain("commitmentId");
    expect(JSON.stringify(example)).not.toContain("responseToken");
    expect(JSON.stringify(example)).not.toContain("alex@example.com");
  });

  it("samples the accounts Connected sources lists", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-sources/status"].get;
    expect(operation.summary).toBe("Connected sources");
    expect(operation.operationId).toBe("getRelationshipSourceStatuses");
    expect(operation.description).toBe(
      "Connected sources lists each account connected to this workspace. The page shows the account and whether its history is still syncing.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters).toBeUndefined();
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      sources: [
        {
          connectionId: "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
          source: "google",
          sourceAccountId: "me@company.com",
          status: "live",
          completeness: "partial",
          backfillPhase: "live",
        },
      ],
    });
  });

  it("samples the sources Sources to connect lists", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationship-sources"].get;
    expect(operation.summary).toBe("Sources to connect");
    expect(operation.operationId).toBe("getRelationshipSourceInventory");
    expect(operation.description).toBe(
      "Sources to connect lists Google, Slack, and HubSpot. The page names each source and offers Connect for Google and HubSpot when no account is connected.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters).toBeUndefined();
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      sources: [
        {
          source: "google",
          displayName: "Google Gmail & Calendar",
          connectPath: "/v1/google-oauth/start",
          accounts: [],
        },
        { source: "slack", displayName: "Slack", accounts: [] },
        { source: "hubspot", displayName: "HubSpot", accounts: [] },
      ],
    });
  });

  it("samples the trail Audit trail opens", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/objects/{resourceRef}/audit"].get;
    expect(operation.summary).toBe("Audit trail");
    expect(operation.operationId).toBe("getObjectAudit");
    expect(operation.description).toBe(
      "Audit trail opens this object's proposal, approval, and execution. The page shows the proposal kind, the approval prefix, and the execution result.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "resourceRef",
        example: "conduit:invoice:inv_456",
      }),
    ]);
    const example = operation.responses["200"].content["application/json"].example;
    expect(example.resourceRef).toBe("conduit:invoice:inv_456");
    expect(example.entries[0].proposal).toMatchObject({
      kind: "conduit.dunning.advance",
      status: "executed",
      rationale: "Acme is 14 days overdue",
      resultRef: "conduit:step:step_1",
      target: "conduit:invoice:inv_456",
    });
    expect(example.entries[0].tokens[0]).toMatchObject({
      consumed: true,
      stepUp: false,
    });
    expect(JSON.stringify(example)).not.toContain("acta_");
  });

  it("samples the audit Reading your last 6 months polls", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-leak-scans/{scanId}"].get;
    expect(operation.summary).toBe("Reading your last 6 months");
    expect(operation.operationId).toBe("getRevenueLeakScan");
    expect(operation.description).toBe(
      "Reading your last 6 months polls this audit while it runs. The page shows how many conversations have been read.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "scanId",
        example: "4d8dfa9b-a7b2-46ea-982c-622a914c00e5",
      }),
    ]);
    const example = operation.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({
      id: "4d8dfa9b-a7b2-46ea-982c-622a914c00e5",
      status: "running",
      lookbackDays: 180,
      threadsSeen: 412,
      startedAt: "2026-07-23T12:00:00Z",
    });
    expect(example.completedAt).toBeUndefined();
    expect(example.error).toBeUndefined();
  });

  it("samples the proposal Approve and run returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/action-proposals/{id}/approve"].post;
    expect(operation.summary).toBe("Approve and run");
    expect(operation.operationId).toBe("approveActionProposal");
    expect(operation.description).toBe(
      "Approve and run posts no body. The page receives the approved proposal and a one-time value, then runs the action.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters[0]).toMatchObject({
      name: "id",
      example: "5f8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      expiresAt: "2026-07-31T14:05:00Z",
      token: "example.not-a-live-approval",
      proposal: {
        id: "5f8dfa9b-a7b2-46ea-982c-622a914c00e5",
        target: "conduit:invoice:inv_456",
        kind: "conduit.dunning.advance",
        status: "approved",
        rationale: "Acme is 14 days overdue",
        financial: false,
      },
    });
    const encoded = JSON.stringify(operation.responses["200"].content["application/json"].example);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain("executedAt");
  });

  it("samples the proposal Execute runs", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/action-proposals/{id}/execute"].post;
    expect(operation.summary).toBe("Execute");
    expect(operation.operationId).toBe("executeActionProposal");
    expect(operation.description).toBe(
      "Execute posts the one-time value Approve and run returned. The page shows the result while it waits for the product to confirm the change.",
    );
    expect(operation.parameters[0]).toMatchObject({
      name: "id",
      example: "5f8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    expect(operation.requestBody.content["application/json"].example).toEqual({
      token: "example.not-a-live-approval",
    });
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      id: "5f8dfa9b-a7b2-46ea-982c-622a914c00e5",
      target: "conduit:invoice:inv_456",
      status: "executed",
      resultRef: "conduit:step:step_1",
      rationale: "Acme is 14 days overdue",
      executedAt: "2026-07-31T14:00:00Z",
    });
    const encoded = JSON.stringify(operation.responses["200"].content["application/json"].example);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain("resolvedAt");
    expect(operation.requestBody.content["application/json"].example.token).not.toContain("acta_");
  });

  it("samples the proposal Reject discards", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/action-proposals/{id}/reject"].post;
    expect(operation.summary).toBe("Reject");
    expect(operation.operationId).toBe("rejectActionProposal");
    expect(operation.description).toBe(
      "Reject posts a short reason. The page discards the action and keeps that reason on the audit trail.",
    );
    expect(operation.parameters[0]).toMatchObject({
      name: "id",
      example: "5f8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    expect(operation.requestBody.content["application/json"].example).toEqual({
      reason: "Customer paid yesterday",
    });
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      id: "5f8dfa9b-a7b2-46ea-982c-622a914c00e5",
      target: "conduit:invoice:inv_456",
      kind: "conduit.dunning.advance",
      paramsJson: '{"amount":100,"step":2}',
      financial: false,
      rationale: "Acme is 14 days overdue",
      status: "rejected",
      reason: "Customer paid yesterday",
      createdAt: "2026-07-31T14:00:00Z",
    });
    const encoded = JSON.stringify(operation.responses["200"].content["application/json"].example);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain("approvedAt");
    expect(encoded).not.toContain("token");
  });

  it("samples the action Re-check policy reloads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions/{actionId}"].get;
    expect(operation.summary).toBe("Reload the checked action");
    expect(operation.operationId).toBe("getRevenueAction");
    expect(operation.description).toBe(
      "Re-check policy reloads this action. The sheet shows the company, the follow-up, and that the check passed.",
    );
    expect(operation.requestBody).toBeUndefined();
    expect(operation.parameters[0]).toMatchObject({
      name: "actionId",
      in: "path",
      required: true,
      schema: { example: "1a8dfa9b-a7b2-46ea-982c-622a914c00e5" },
    });
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      id: "1a8dfa9b-a7b2-46ea-982c-622a914c00e5",
      relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      relationshipName: "Acme",
      actionType: "warm_follow_up",
      channel: "email",
      detector: "requested_follow_up_due",
      revision: 1,
      revisionHash: "sha256:ab12...",
      reason: "They asked for a follow-up in July.",
      recipientEmail: "buyer@example.com",
      proposedSubject: "Following up as promised",
      proposedMessage: "Hi Jordan — you asked me to circle back this month...",
      senderAccountRef: "gmail:me@company.com",
      priorityScore: 82,
      priorityComponents: {
        commitment_urgency: 40,
        recency_signal: 12,
        relationship_value: 30,
      },
      queueStatus: "open",
      policyStatus: "passed",
      approvalStatus: "pending",
      executionStatus: "pending",
      executionOwner: "rowboat",
      executionMode: "send",
      dueAt: "2026-07-15T00:00:00Z",
      createdAt: "2026-07-12T12:00:00Z",
      updatedAt: "2026-07-12T12:00:00Z",
      evidence: [
        {
          id: "4b8dfa9b-a7b2-46ea-982c-622a914c00e5",
          source: "gmail",
          sourceRecordId: "gmail:thread:thr_01",
          excerpt: "Can you circle back this month?",
          occurredAt: "2026-07-01T14:00:00Z",
          externalEvidenceRefs: ["gmail:message:msg_01"],
        },
      ],
    });
    const encoded = JSON.stringify(operation.responses["200"].content["application/json"].example);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain("approvedAt");
  });

  it("samples the follow-up Create task saves", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions"].post;
    expect(operation.summary).toBe("Create task");
    expect(operation.operationId).toBe("createRevenueAction");
    expect(operation.description).toBe(
      "Create task saves a follow-up on a company. It sends the title, the due time, and a priority of 30.",
    );
    expect(operation.requestBody.content["application/json"].example).toEqual({
      relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      actionType: "follow_up_task",
      channel: "task",
      reason: "Follow up on the proposal",
      dueAt: "2026-07-15T17:00:00Z",
      priorityScore: 30,
    });
    expect(operation.responses["201"].content["application/json"].example).toEqual({
      id: "3a8dfa9b-a7b2-46ea-982c-622a914c00e5",
      relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      relationshipName: "Acme",
      actionType: "follow_up_task",
      channel: "task",
      detector: "manual",
      revision: 1,
      revisionHash: "sha256:ab12...",
      reason: "Follow up on the proposal",
      priorityScore: 30,
      queueStatus: "open",
      policyStatus: "pending",
      approvalStatus: "pending",
      executionStatus: "pending",
      executionOwner: "rowboat",
      executionMode: "draft",
      dueAt: "2026-07-15T17:00:00Z",
      createdAt: "2026-07-15T16:00:00Z",
      updatedAt: "2026-07-15T16:00:00Z",
      evidence: [],
    });
    const encoded = JSON.stringify(operation.responses["201"].content["application/json"].example);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain("approvedAt");
  });

  it("samples the open tasks Tasks loads soonest due first", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-actions"].get;
    expect(operation.summary).toBe("Tasks");
    expect(operation.operationId).toBe("listRevenueActions");
    expect(operation.description).toBe(
      "Tasks loads open follow-ups with the soonest due date first. It asks for open tasks, one hundred at a time, and does not ask for an older page. The first task is Follow up on the proposal, due on July 15.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map((parameter: { name: string; schema?: { example?: unknown } }) => [
        parameter.name,
        parameter.schema?.example,
      ]),
    );
    expect(examples).toMatchObject({
      queueStatus: "open",
      limit: 100,
      surface: "task",
      due: "asc",
    });
    expect(examples.offset).toBeUndefined();
    const page = operation.responses["200"].content["application/json"].example;
    expect(page).toEqual({
      actions: [
        {
          id: "3a8dfa9b-a7b2-46ea-982c-622a914c00e5",
          relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
          relationshipName: "Acme",
          actionType: "follow_up_task",
          channel: "task",
          detector: "manual",
          revision: 1,
          revisionHash: "sha256:ab12...",
          reason: "Follow up on the proposal",
          priorityScore: 30,
          queueStatus: "open",
          policyStatus: "pending",
          approvalStatus: "pending",
          executionStatus: "pending",
          executionOwner: "rowboat",
          executionMode: "draft",
          dueAt: "2026-07-15T17:00:00Z",
          createdAt: "2026-07-15T16:00:00Z",
          updatedAt: "2026-07-15T16:00:00Z",
          evidence: [],
        },
      ],
      hasMore: false,
    });
    const encoded = JSON.stringify(page);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain("approvedAt");
    expect(encoded).not.toContain('"token"');
  });

  it("samples the company Confirm retraction returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/assertions/{assertionId}/retract"].post;
    expect(operation.summary).toBe("Confirm retraction");
    expect(operation.operationId).toBe("retractRelationshipAssertion");
    expect(operation.description).toBe(
      "Confirm retraction ends a correction on this company. It sends the reason, and the company comes back without that correction.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map((parameter: { name: string; schema?: { example?: unknown } }) => [
        parameter.name,
        parameter.schema?.example,
      ]),
    );
    expect(examples).toEqual({
      relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      assertionId: "7c8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    expect(operation.requestBody.content["application/json"].example).toEqual({
      reason: "The correction was entered against the wrong customer call.",
    });
    const company = operation.responses["200"].content["application/json"].example;
    expect(company).toMatchObject({
      id: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      kind: "company",
      displayName: "Acme",
      health: "needs_attention",
      stateReason: "Security review was promised, but no owner or meeting exists.",
    });
    const encoded = JSON.stringify(company);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain('"token"');
  });

  it("samples the company Use this value returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/contradictions/{caseId}/resolve"].post;
    expect(operation.summary).toBe("Use this value");
    expect(operation.operationId).toBe("resolveRelationshipContradiction");
    expect(operation.description).toBe(
      "Use this value closes a disagreement on this company. It sends the evidence you picked and why, and the company comes back with that value current.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map((parameter: { name: string; schema?: { example?: unknown } }) => [
        parameter.name,
        parameter.schema?.example,
      ]),
    );
    expect(examples).toEqual({
      relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      caseId: "contradiction:d109218617da1fbea89bb5d6",
    });
    expect(operation.requestBody.content["application/json"].example).toEqual({
      reason: "You chose the value from Gmail.",
      selectedAssertionId: "7b8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    const result = operation.responses["201"].content["application/json"].example;
    expect(result.relationship).toMatchObject({
      id: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      kind: "company",
      displayName: "Acme",
      health: "needs_attention",
    });
    expect(result.intelligence.contradictionCases[0]).toMatchObject({
      status: "user_resolved",
      reason: "You chose the value from Gmail.",
    });
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain('"token"');
    expect(encoded).not.toContain("assertion:ab12");
  });

  it("samples the company Correct a detail returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships/{relationshipId}/corrections"].post;
    expect(operation.summary).toBe("Correct a detail");
    expect(operation.operationId).toBe("correctRelationship");
    expect(operation.description).toBe(
      "Correct a detail replaces one field on this company. It sends the field, the new value, and why, and the company comes back with that value.",
    );
    expect(operation.parameters[0].schema.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(operation.requestBody.content["application/json"].example).toEqual({
      dimension: "health",
      value: "healthy",
      reason: "The review happened yesterday.",
    });
    const company = operation.responses["201"].content["application/json"].example;
    expect(company).toMatchObject({
      id: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      kind: "company",
      displayName: "Acme",
      health: "healthy",
      stateReason: "The review happened yesterday.",
    });
    const encoded = JSON.stringify(company);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain('"token"');
  });

  it("samples the page Show earlier evidence loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships/{relationshipId}/conversation-review"].get;
    expect(operation.summary).toBe("Show earlier evidence");
    expect(operation.operationId).toBe("getRelationshipConversationReview");
    expect(operation.description).toBe(
      "Show earlier evidence loads the next page of focused review. It skips the newest 200 conversations. This page has one speaker to resolve, and no older conversation after it.",
    );
    const examples = Object.fromEntries(
      operation.parameters.map((parameter: { name: string; schema?: { example?: unknown } }) => [
        parameter.name,
        parameter.schema?.example,
      ]),
    );
    expect(examples).toEqual({
      relationshipId: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      offset: 200,
    });
    const page = operation.responses["200"].content["application/json"].example;
    expect(page.hasMore).toBe(false);
    expect(page.reviewItems[0]).toMatchObject({
      kind: "speaker",
      label: "Resolve the speaker for a material statement",
      exactQuote: "We are concerned security could delay the renewal.",
      observationId: "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    const encoded = JSON.stringify(page);
    expect(encoded).not.toContain("acta_");
    expect(encoded).not.toContain('"token"');
  });

  it("samples the workspace Local mode loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/revenue-workspaces/current"].get;
    expect(operation.summary).toBe("Local mode");
    expect(operation.operationId).toBe("getRevenueWorkspace");
    expect(operation.description).toBe(
      "Local mode is the workspace Connected sources opens before a sending workspace is linked. It comes back local and active, and the sending check stays off.",
    );
    expect(operation.parameters).toBeUndefined();
    expect(operation.requestBody).toBeUndefined();
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      id: "0b8dfa9b-a7b2-46ea-982c-622a914c00e5",
      mode: "local",
      status: "active",
      preflightAvailable: false,
    });
  });

  it("samples the person New person returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/relationships"].post;
    expect(operation.summary).toBe("New person");
    expect(operation.operationId).toBe("createRelationship");
    expect(operation.description).toBe(
      "New person saves the name and email. The person comes back with that name, and People can open them.",
    );
    expect(operation.requestBody.content["application/json"].example).toEqual({
      accountDomain: "example.com",
      displayName: "Jordan Buyer",
      kind: "person",
      primaryEmail: "buyer@example.com",
    });
    expect(operation.responses["201"].content["application/json"].example).toMatchObject({
      id: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      kind: "person",
      displayName: "Jordan Buyer",
      primaryEmail: "buyer@example.com",
      accountDomain: "example.com",
      status: "active",
      lifecycle: "prospect",
      health: "unknown",
      stateVersion: 0,
      projectorVersion: 1,
    });
  });

  it("samples the page Show earlier conversations loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/agent-sessions"].get;
    expect(operation.summary).toBe("Show earlier conversations");
    expect(operation.operationId).toBe("listAgentSessions");
    expect(operation.description).toBe(
      "Show earlier conversations loads the next page of History. It skips the newest 50 conversations. This page has one older conversation, and no conversation after it.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "offset",
        example: 50,
        schema: expect.objectContaining({ example: 50 }),
      }),
    ]);
    expect(operation.responses["200"].content["application/json"].example).toMatchObject({
      hasMore: false,
      sessions: [
        {
          sessionId: "c8dfa9b6-a7b2-46ea-982c-622a914c00e5",
          title: "Review the Acme renewal",
          channel: "web",
          continuationToken: "",
        },
      ],
    });
  });

  it("samples the preferences Profile loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/console/preferences"].get;
    expect(operation.summary).toBe("Profile");
    expect(operation.operationId).toBe("getConsolePreferences");
    expect(operation.description).toBe(
      "Profile loads the saved display name, the default agent, and whether usage data is shared. Before a name is saved, the name and the agent are empty, usage sharing is off, notifications are off, and the theme follows the system.",
    );
    expect(operation.responses["200"].content["application/json"].example).toEqual({
      displayName: "",
      defaultAgentSlug: "",
      shareUsageData: false,
      notificationLevel: "off",
      showModelReasoning: false,
      theme: "system",
    });
  });

  it("samples the favorite Remove from favorites deletes", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation = presented.paths["/v1/console/resources/{resourceId}"].delete;
    expect(operation.summary).toBe("Remove from favorites");
    expect(operation.operationId).toBe("deleteConsoleResource");
    expect(operation.description).toBe(
      "Remove from favorites deletes the saved favorite for that note. The note stays.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "resourceId",
        example: "e8dfa9b6-a7b2-46ea-982c-622a914c00e5",
        schema: expect.objectContaining({ example: "e8dfa9b6-a7b2-46ea-982c-622a914c00e5" }),
      }),
    ]);
    expect(operation.responses["204"].description).toBe("The favorite is gone.");
    expect(operation.responses["204"].content).toBeUndefined();
  });

  it("samples the plan Draft an email to share this plan returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const operation =
      presented.paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/share"].post;
    expect(operation.summary).toBe("Draft an email to share this plan");
    expect(operation.operationId).toBe("shareMutualActionPlan");
    expect(operation.description).toBe(
      "Draft an email to share this plan marks that approved plan as shared and writes a draft email. The email is not sent.",
    );
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "relationshipId",
        example: "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
      }),
      expect.objectContaining({
        name: "planId",
        example: "plan:f8dfa9b6-a7b2-46ea-982c-622a914c00e5",
      }),
    ]);
    expect(operation.responses["200"]).toBeUndefined();
    const created = operation.responses["201"].content["application/json"].example;
    expect(created.plan.status).toBe("shared");
    expect(created.plan.tokenState).toBe("active");
    expect(created.plan.currentRevision.items[0].title).toBe("Follow up on the proposal");
    expect(created.responseToken).toBe(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    expect(JSON.stringify(created)).not.toContain("acta_");
  });

  it("samples the promise They accepted returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const post =
      presented.paths["/v1/relationships/{relationshipId}/commitments/{commitmentId}/transitions"]
        .post;
    expect(post.summary).toBe("They accepted");
    expect(post.operationId).toBe("appendCommitmentTransition");
    expect(post.description).toBe(
      "They accepted records that the other party accepted this promise. The promise stays open.",
    );
    const relationship = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "relationshipId",
    );
    const commitment = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "commitmentId",
    );
    expect(relationship.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(commitment.example).toBe("8b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.responses["200"]).toBeUndefined();
    const example = post.responses["201"].content["application/json"].example;
    expect(example.acceptance).toBe("accepted");
    expect(example.status).toBe("open");
    expect(example.text).toBe("Send the security packet.");
    expect(example.currentEventVersion).toBe(4);
    expect(JSON.stringify(post)).not.toContain("acta_");
  });

  it("samples the conversation change Approve accepts", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/relationships/{relationshipId}/conversation-decisions"].post;
    expect(post.summary).toBe("Approve");
    expect(post.operationId).toBe("decideConversationChange");
    expect(post.description).toBe(
      "Approve accepts this proposed conversation change. The company and its review queue refresh.",
    );
    const relationship = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "relationshipId",
    );
    expect(relationship.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.requestBody.content["application/json"].example.kind).toBe("approve");
    expect(post.responses["200"]).toBeUndefined();
    const example = post.responses["201"].content["application/json"].example;
    expect(example.relationship.displayName).toBe("Acme");
    expect(example.relationship.kind).toBe("company");
    expect(example.relationship.stateVersion).toBe(5);
    expect(example.intelligence.reviewItems).toEqual([]);
    expect(JSON.stringify(post)).not.toContain("acta_");
  });

  it("samples the receipt Confirm delete returns", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/relationships/{relationshipId}/conversation-deletion"].post;
    expect(post.summary).toBe("Confirm delete");
    expect(post.operationId).toBe("requestConversationDeletion");
    expect(post.description).toBe(
      "Confirm delete removes this company's conversation evidence from Oppulence. Copies on this device and at the mailbox stay until they are checked.",
    );
    const relationship = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "relationshipId",
    );
    expect(relationship.example).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.requestBody.content["application/json"].example.requestId).toBeTruthy();
    const example = post.responses["202"].content["application/json"].example;
    expect(example.status).toBe("partial");
    expect(example.legalHold).toBe(false);
    expect(example.scopeRef).toBe("9c8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(
      example.targets.find((target: { target: string }) => target.target === "api_evidence").status,
    ).toBe("deleted");
    expect(
      example.targets.find((target: { target: string }) => target.target === "provider").status,
    ).toBe("pending");
    expect(example.completedAt).toBeUndefined();
    expect(JSON.stringify(post)).not.toContain("acta_");
  });

  it("samples the follow-up Dismiss removes", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/revenue-actions/{actionId}/dismiss"].post;
    expect(post.summary).toBe("Dismiss");
    expect(post.operationId).toBe("dismissRevenueAction");
    expect(post.description).toBe(
      "Dismiss removes this follow-up from the queue and stores the reason.",
    );
    const action = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "actionId",
    );
    expect(action.example).toBe("1a8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.requestBody.content["application/json"].example).toEqual({
      reason: "not_relevant",
    });
    const example = post.responses["200"].content["application/json"].example;
    expect(example.queueStatus).toBe("dismissed");
    expect(example.dismissReason).toBe("not_relevant");
    expect(example.relationshipName).toBe("Acme");
    expect(example.approvedAt).toBeUndefined();
    expect(presented.components.schemas.RevenueAction.properties.dismissReason.example).toBe(
      "not_relevant",
    );
    expect(JSON.stringify(post)).not.toContain("acta_");
  });

  it("samples the follow-up Reject declines", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/revenue-actions/{actionId}/reject"].post;
    expect(post.summary).toBe("Reject");
    expect(post.operationId).toBe("rejectRevenueAction");
    expect(post.description).toBe(
      "Reject declines this follow-up. The decision is stored and the follow-up stays open.",
    );
    const action = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "actionId",
    );
    expect(action.example).toBe("1a8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.requestBody.content["application/json"].example).toEqual({
      reason: "not_appropriate",
    });
    const example = post.responses["200"].content["application/json"].example;
    expect(example.approvalStatus).toBe("rejected");
    expect(example.queueStatus).toBe("open");
    expect(example.relationshipName).toBe("Acme");
    expect(example.approvedAt).toBeUndefined();
    expect(JSON.stringify(post)).not.toContain("acta_");
    expect(JSON.stringify(post)).not.toContain("wrong_recipient");
  });

  it("samples the attention item Review records", () => {
    const presented = presentApiReferenceDocument(spec);
    const post = presented.paths["/v1/relationship-attention/{attentionId}/decisions"].post;
    expect(post.summary).toBe("Review");
    expect(post.operationId).toBe("decideRelationshipAttention");
    expect(post.description).toBe(
      "Review records that this attention item was reviewed. It leaves the open queue.",
    );
    const attention = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "attentionId",
    );
    expect(attention.example).toBe("da8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.requestBody.content["application/json"].example).toEqual({
      decision: "acknowledge",
      reason: "Reviewed from the portfolio attention queue.",
      expectedVersion: 1,
    });
    const example = post.responses["200"].content["application/json"].example;
    expect(example.status).toBe("acknowledged");
    expect(example.stateReason).toBe("Reviewed from the portfolio attention queue.");
    expect(example.relationshipName).toBe("Acme");
    expect(example.version).toBe(2);
    expect(example.projectorVersion).toBe(2);
    expect(example.snoozedUntil).toBeUndefined();
    expect(example.dismissedAt).toBeUndefined();
    expect(
      presented.components.schemas.RelationshipAttentionItem.properties.stateReason.example,
    ).toBe("Reviewed from the portfolio attention queue.");
    expect(JSON.stringify(post)).not.toContain("acta_");
  });

  it("samples the duplicate Merge combines", () => {
    const presented = presentApiReferenceDocument(spec);
    const post =
      presented.paths["/v1/relationship-identity-candidates/{candidateId}/decisions"].post;
    expect(post.summary).toBe("Merge");
    expect(post.operationId).toBe("decideRelationshipIdentityCandidate");
    expect(post.description).toBe(
      "Merge combines this possible duplicate into the company that already exists. The extra company is archived.",
    );
    const candidate = post.parameters.find(
      (parameter: { name: string }) => parameter.name === "candidateId",
    );
    expect(candidate.example).toBe("6b8dfa9b-a7b2-46ea-982c-622a914c00e5");
    expect(post.requestBody.content["application/json"].example).toEqual({
      decision: "merge",
      expectedVersion: 1,
      reason: "Reviewed in the identity inbox: merge.",
      idempotencyKey: "cb8dfa9b-a7b2-46ea-982c-622a914c00e5",
    });
    const example = post.responses["200"].content["application/json"].example;
    expect(example.status).toBe("resolved");
    expect(example.decision).toBe("merge");
    expect(example.existingRelationship.displayName).toBe("Acme");
    expect(example.proposedRelationship.status).toBe("archived");
    expect(example.lineage[0].kind).toBe("merged");
    expect(JSON.stringify(post)).not.toContain("identity-review:123");
    expect(JSON.stringify(post)).not.toContain("acta_");
  });

  it("samples the HubSpot connection Disconnect removes", () => {
    const presented = presentApiReferenceDocument(spec);
    const del = presented.paths["/v1/connections/{name}"].delete;
    expect(del.summary).toBe("Disconnect");
    expect(del.operationId).toBe("deleteConnection");
    expect(del.description).toBe(
      "Disconnect removes the HubSpot connection. Confirm sends no body.",
    );
    const name = del.parameters.find((parameter: { name: string }) => parameter.name === "name");
    expect(name.example).toBe("hubspot");
    expect(name.schema.example).toBe("hubspot");
    expect(del.requestBody).toBeUndefined();
    expect(del.responses["204"].description).toBe("The HubSpot connection is removed.");
    expect(del.responses["204"].content).toBeUndefined();
    expect(JSON.stringify(del)).not.toContain("canvas");
    expect(JSON.stringify(del)).not.toContain("acta_");
    expect(JSON.stringify(del)).not.toContain('"token"');
  });

  it("samples the Canvas connection Connect starts", () => {
    const presented = presentApiReferenceDocument(spec);
    const start = presented.paths["/v1/connections/{name}/start"].post;
    const callback = "https://oppulence.io/api/connectors/oauth/callback";
    expect(start.summary).toBe("Connect");
    expect(start.operationId).toBe("startConnection");
    expect(start.description).toBe(
      "Connect starts sign-in for Canvas. It sends the required permissions and the address that brings you back to Connections.",
    );
    expect(start.parameters[0].example).toBe("canvas");
    expect(start.requestBody.content["application/json"].example).toEqual({
      redirectTarget: callback,
      requestedScopes: ["canvas:invoices.read", "canvas:customers.read"],
    });
    expect(start.requestBody.description).toBe(
      "Required Canvas permissions and the address that brings you back to Connections.",
    );
    const alias = presented.paths["/v1/connectors/{name}/start"].post;
    expect(alias.summary).toBe("Connect");
    expect(alias.operationId).toBe("startConnector");
    expect(alias.requestBody.content["application/json"].example.redirectTarget).toBe(callback);
    expect(
      presented.components.schemas.ConnectionStartRequest.properties.redirectTarget.example,
    ).toBe(callback);
    expect(
      presented.components.schemas.ConnectionStartRequest.properties.redirect_after.example,
    ).toBe("solomon-ai://connection-complete");
    const serialized = JSON.stringify(start.requestBody);
    expect(serialized).not.toContain("solomon-ai://connection-complete");
    expect(serialized).not.toContain("acta_");
    expect(serialized).not.toContain('"token"');
  });

  it("samples the confirmation Confirm plan records", () => {
    const presented = presentApiReferenceDocument(spec);
    const respond = presented.paths["/v1/public/mutual-action-plan/responses"].post;
    const responseID = "db8dfa9b-a7b2-46ea-982c-622a914c00e5";
    expect(respond.summary).toBe("Confirm plan");
    expect(respond.operationId).toBe("respondPublicMutualActionPlan");
    expect(respond.description).toBe(
      "Confirm plan records that the other person confirmed the shared plan. The owner's records stay unchanged.",
    );
    expect(respond.requestBody.content["application/json"].example).toEqual({
      responseId: responseID,
      kind: "confirm",
      comment: "",
    });
    expect(respond.responses["201"].description).toBe("The confirmation is recorded.");
    expect(respond.responses["201"].content["application/json"].example).toEqual({
      responseId: responseID,
      recorded: true,
    });
    expect(respond.parameters[0].example).toBeUndefined();
    const serialized = JSON.stringify(respond);
    expect(serialized).not.toContain("response:ab12");
    expect(serialized).not.toContain("acta_");
    expect(serialized).not.toContain('"token"');
  });

  it("samples the Jira connection Connect starts", () => {
    const presented = presentApiReferenceDocument(spec);
    const connect = presented.paths["/v1/composio/connections"].post;
    expect(connect.summary).toBe("Connect");
    expect(connect.operationId).toBe("startComposioConnection");
    expect(connect.description).toBe(
      "Connect opens the Jira sign-in page. The account is linked only after that page is finished.",
    );
    expect(connect.requestBody.description).toBe("The product Connect opens.");
    expect(connect.requestBody.content["application/json"].example).toEqual({ toolkit: "jira" });
    expect(connect.responses["200"].description).toBe("The Jira sign-in page is ready.");
    expect(connect.responses["200"].content["application/json"].example).toEqual({
      connectionId: "ca_8b8dfa9ba7b246ea982c622a914c00e5",
      redirectUrl: "https://connect.composio.dev/link/lk_8b8dfa9b",
      expiresAt: "2026-07-15T16:05:00Z",
    });
    const serialized = JSON.stringify(connect);
    expect(serialized).not.toContain("acta_");
    expect(serialized).not.toContain('"token"');
    expect(serialized).not.toContain("gmail");
    expect(serialized).not.toContain("hubspot");
  });

  it("samples the catalog More products lists", () => {
    const presented = presentApiReferenceDocument(spec);
    const list = presented.paths["/v1/composio/toolkits"].get;
    expect(list.summary).toBe("More products");
    expect(list.operationId).toBe("listComposioToolkits");
    expect(list.description).toBe(
      "More products lists Jira and Asana. Gmail, Google Calendar, and HubSpot stay on their own cards.",
    );
    expect(list.requestBody).toBeUndefined();
    expect(list.responses["200"].description).toBe("Jira and Asana are available to connect.");
    expect(list.responses["200"].content["application/json"].example).toEqual({
      toolkits: [
        { slug: "jira", name: "Jira", managedAuth: true },
        { slug: "asana", name: "Asana", managedAuth: true },
      ],
    });
    const serialized = JSON.stringify(list.responses["200"].content["application/json"].example);
    expect(serialized).not.toContain("gmail");
    expect(serialized).not.toContain("hubspot");
    expect(serialized).not.toContain("acta_");
    expect(serialized).not.toContain('"token"');
  });

  it("samples the Jira connection Disconnect Jira removes", () => {
    const presented = presentApiReferenceDocument(spec);
    const remove = presented.paths["/v1/composio/connections/{connectionID}"].delete;
    const connectionID = "ca_8b8dfa9ba7b246ea982c622a914c00e5";
    expect(remove.summary).toBe("Disconnect Jira");
    expect(remove.operationId).toBe("deleteComposioConnection");
    expect(remove.description).toBe(
      "Disconnect Jira removes that connection. The request sends no body.",
    );
    expect(remove.requestBody).toBeUndefined();
    expect(remove.parameters[0].example).toBe(connectionID);
    expect(remove.responses["204"].description).toBe("The Jira connection is removed.");
    expect(remove.responses["204"].content).toBeUndefined();
    const serialized = JSON.stringify(remove);
    expect(serialized).not.toContain("acta_");
    expect(serialized).not.toContain('"token"');
    expect(serialized).not.toContain("hubspot");
  });

  it("samples the account Connected lists", () => {
    const presented = presentApiReferenceDocument(spec);
    const list = presented.paths["/v1/composio/connections"].get;
    expect(list.summary).toBe("Connected");
    expect(list.operationId).toBe("listComposioConnections");
    expect(list.description).toBe("Connected lists the Jira account linked from More products.");
    expect(list.requestBody).toBeUndefined();
    expect(list.responses["200"].description).toBe("Jira is connected.");
    expect(list.responses["200"].content["application/json"].example).toEqual({
      connections: [
        {
          id: "ca_8b8dfa9ba7b246ea982c622a914c00e5",
          toolkit: "jira",
          status: "ACTIVE",
          createdAt: "2026-07-15T16:00:00Z",
        },
      ],
    });
    const serialized = JSON.stringify(list.responses["200"].content["application/json"].example);
    expect(serialized).not.toContain("gmail");
    expect(serialized).not.toContain("hubspot");
    expect(serialized).not.toContain("acta_");
    expect(serialized).not.toContain('"token"');
  });

  it("samples the agent Configure loads", () => {
    const presented = presentApiReferenceDocument(spec);
    const agent = presented.paths["/v1/agents/{slug}"].get;
    expect(agent.summary).toBe("Configure");
    expect(agent.operationId).toBe("getAgent");
    expect(agent.description).toBe("Configure loads this agent's name, purpose, model, and tools.");
    expect(agent.requestBody).toBeUndefined();
    expect(agent.parameters[0]).toMatchObject({
      name: "slug",
      example: "acme-follow-up",
    });
    expect(agent.responses["200"].description).toBe("The agent is ready to configure.");
    expect(agent.responses["200"].content["application/json"].example).toEqual({
      slug: "acme-follow-up",
      name: "Acme follow-up",
      source: "tenant",
      instructions: "Draft the next follow-up for Acme.",
      model: "openai/gpt-4.1-mini",
      provider: "openrouter",
      enabledTools: ["relationship.read"],
    });
    expect(JSON.stringify(agent.responses["200"])).not.toContain("acta_");
    expect(JSON.stringify(agent.responses["200"])).not.toContain('"token"');
  });

  it("says the reference could not be loaded when the spec is missing", () => {
    const page = renderApiReferencePage(null);
    expect(page).toContain("The API reference could not be loaded.");
    expect(page).not.toContain("unpkg.com");
  });

  it("names the status values listed on the field", () => {
    const presented = presentApiReferenceDocument(spec);
    const workspace = presented.components.schemas.RevenueWorkspace.properties.status.description;
    expect(workspace).toBe("Active, disconnected, or needs repair.");
    expect(workspace).not.toContain("billing");
    expect(workspace).not.toContain("Background runs");
    expect(
      presented.components.schemas.BackgroundTaskRunStatusResponse.properties.status.description,
    ).toBe("Queued, running, succeeded, failed, or stopped.");
    // The current plan names its trial instead of listing every billing state.
    expect(presented.components.schemas.BillingState.properties.status.description).toBe(
      "Trial means this plan is still in its trial.",
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
