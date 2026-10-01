import { describe, expect, it } from "vitest";

import {
  activityEvidenceLines,
  enumLabel,
  missingScopeLabels,
  relationshipDeltaValue,
  removePersonConfirmCopy,
  scopeLabel,
  sourceProductCopy,
} from "./source-product-copy";

describe("source product copy", () => {
  it("asks before a person is removed", () => {
    expect(removePersonConfirmCopy("Morgan Hale")).toBe(
      "Remove Morgan Hale and everything derived from them? Their address is suppressed, so a later sync will not recreate them. This cannot be undone.",
    );
    expect(removePersonConfirmCopy("  ")).toContain("Remove this person");
  });

  it("describes connected evidence sources without scope jargon", () => {
    const google = sourceProductCopy(
      "google",
      "Read scopes build relationship history. Write scopes are requested progressively only when you enable an approval-gated action.",
    );
    expect(google.explanation).toBe(
      "Read recent mail and meetings to build company history. Sending and calendar changes wait for approval.",
    );
    expect(google.read).toBe("Mail and calendar");
    expect(google.write).toBe("Drafts, sending, and calendar changes");
    expect(google.explanation).not.toMatch(/scope|relationship history|approval-gated/i);

    const slack = sourceProductCopy("slack", "chat:write is used only after approval.");
    expect(slack.explanation).not.toContain("chat:write");
    expect(slack.write).toBe("Post a message");

    const hubspot = sourceProductCopy("hubspot", "beta does not silently mutate CRM-owned fields.");
    expect(hubspot.explanation).not.toMatch(/beta|mutate|scopes/i);
    expect(hubspot.read).toBe("Companies, contacts, and deals");
  });

  it("names a lifecycle token and a raw scope as words", () => {
    expect(enumLabel("active_customer")).toBe("Active Customer");
    expect(enumLabel("needs_attention")).toBe("Needs Attention");
    expect(enumLabel("former_customer")).toBe("Former Customer");
    expect(enumLabel(undefined)).toBe("Unknown");
    expect(scopeLabel("https://www.googleapis.com/auth/gmail.readonly")).toBe("Mail");
    expect(scopeLabel("chat:write")).toBe("Post a message");
    expect(missingScopeLabels(["https://www.googleapis.com/auth/gmail.send", "chat:write"])).toBe(
      "Sending, Post a message",
    );
  });

  it("reads a state change as words", () => {
    expect(relationshipDeltaValue("prospect")).toBe("Prospect");
    expect(relationshipDeltaValue("needs_attention")).toBe("Needs Attention");
    expect(relationshipDeltaValue(null)).toBe("Unknown");
    expect(relationshipDeltaValue("")).toBe("Unknown");
    expect(relationshipDeltaValue("Call them Friday")).toBe("Call them Friday");
    expect(relationshipDeltaValue(["timeline", "budget hold"])).toBe("Timeline, budget hold");
    expect(relationshipDeltaValue([])).toBe("None");
    expect(relationshipDeltaValue({ value: "healthy" })).toBe("Healthy");
    expect(relationshipDeltaValue({ other: true })).toBe("Unknown");
  });

  it("reads a saved note instead of the empty payload", () => {
    const facts = {
      noteId: "note-1",
      title: "Harbor follow-up",
      body: "Ask about the sandbox login.",
      content: [{ type: "p", children: [{ text: "Ask about the sandbox login." }] }],
      meetingLinked: true,
    };
    expect(activityEvidenceLines(null, facts)).toEqual([
      "Title: Harbor follow-up",
      "Note: Ask about the sandbox login.",
      "Marked as a meeting note.",
    ]);
    expect(activityEvidenceLines(null, facts).join("\n")).not.toContain("null");
    expect(activityEvidenceLines(null, facts).join("\n")).not.toContain("note-1");
    expect(activityEvidenceLines(null, facts).join("\n")).not.toContain('"type"');
    expect(
      activityEvidenceLines(
        { subject: "Sandbox login", from: "ada@harbor.example" },
        { body: "unused when the payload already has words" },
      ),
    ).toEqual(["Subject: Sandbox login", "From: ada@harbor.example"]);
    expect(activityEvidenceLines("The original sentence.", null)).toEqual([
      "The original sentence.",
    ]);
    expect(activityEvidenceLines(null, { noteId: "only-an-id" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(
      activityEvidenceLines(null, {
        content: [{ type: "p", children: [{ text: "Body lives in the editor." }] }],
      }),
    ).toEqual(["Note: Body lives in the editor."]);
  });
});
