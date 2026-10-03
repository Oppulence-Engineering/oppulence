import { describe, expect, it } from "vitest";

import {
  activityEvidenceLines,
  activityHeading,
  activityOutcomeSummary,
  enumLabel,
  mailAccessReason,
  missingScopeLabels,
  relationshipDeltaValue,
  removePersonConfirmCopy,
  scopeLabel,
  sourceConnectionLabel,
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
    expect(enumLabel("thread.updated")).toBe("Thread Updated");
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

  it("names an activity with the product title", () => {
    expect(activityHeading("gmail", "thread.updated")).toBe("Gmail · Mail updated");
    expect(activityHeading("desktop_note", "note")).toBe("A note · Note saved");
    expect(activityHeading("hubspot", "company.updated")).toBe("HubSpot · Company updated");
    expect(activityHeading("custom_feed", "custom.event_name")).toBe(
      "Custom Feed · Custom Event Name",
    );
    expect(activityHeading("gmail", "action.outcome.meeting_booked")).toBe(
      "Gmail · Meeting booked",
    );
    expect(activityHeading("user", "action.outcome.bad_recommendation")).toBe(
      "Added by you · Not a good suggestion",
    );
    expect(activityHeading("gmail", "action.outcome.replied")).toBe("Gmail · They replied");
    expect(activityOutcomeSummary("Action outcome observed: meeting booked.")).toBe(
      "Meeting booked",
    );
    expect(activityOutcomeSummary("The harbor packet arrived")).toBeNull();
    expect(activityHeading("gmail", "action.outcome.meeting_booked")).not.toContain(
      "action.outcome",
    );
    expect(
      activityEvidenceLines(null, {
        outcome_kind: "meeting_booked",
        provider_source: "gmail",
        action_id: "a21f0000-0000-4000-8000-000000000009",
        recommendation_revision: 1,
        channel: "email",
      }).join("\n"),
    ).not.toMatch(/outcome_kind|action_id|meeting_booked|recommendation_revision/);
    expect(activityHeading("gmail", "thread.updated")).not.toContain("thread.updated");
    expect(activityHeading("desktop_note", "note")).not.toContain("desktop_note");
    expect(mailAccessReason("mailbox_owner")).toBe("Your mailbox");
    expect(mailAccessReason("owner_private")).toBe("Kept private");
    expect(mailAccessReason("explicit_grant")).toBe("Shared with you");
    expect(mailAccessReason("mailbox_owner")).not.toContain("mailbox_owner");
    expect(
      sourceConnectionLabel({
        source: "hubspot",
        status: "reconnect_required",
        completeness: "disconnected",
      }),
    ).toBe("Reconnect required");
    expect(
      sourceConnectionLabel({ source: "google", status: "live", completeness: "complete" }),
    ).toBe("Active");
    expect(sourceConnectionLabel({ source: "google", status: "not_connected" })).toBe(
      "Not connected",
    );
    expect(sourceConnectionLabel({ source: "slack", status: "not_connected" })).not.toBe(
      "Sync incomplete",
    );
  });
});
