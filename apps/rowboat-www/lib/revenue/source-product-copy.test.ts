import { describe, expect, it } from "vitest";

import {
  activityEvidenceLines,
  activityLinesBesideSummary,
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
    expect(relationshipDeltaValue("needs_attention")).toBe("Needs attention");
    expect(relationshipDeltaValue("unknown")).toBe("Not known");
    expect(relationshipDeltaValue("active_customer")).toBe("Active customer");
    expect(relationshipDeltaValue("former_customer")).toBe("Former customer");
    expect(relationshipDeltaValue("historical_unknown")).toBe("Not recorded for this date");
    expect(relationshipDeltaValue("review_required")).toBe("Needs review");
    expect(relationshipDeltaValue("at_risk")).toBe("At risk");
    expect(relationshipDeltaValue("stale")).toBe("Out of date");
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

  it("reads a confirmed meeting as a promise, not the stored tokens", () => {
    const lines = activityEvidenceLines(null, {
      user_confirmed: true,
      commitment_text: "Send the proposal",
      commitment_direction: "promised_by_me",
      commitment_id: "session-1:0-2000",
      commitment_due_at: "2026-08-01T12:35:00Z",
      evidence_quote: "I will send the proposal.",
      evidence_start_ms: 0,
      evidence_end_ms: 2000,
      owner_participant_ref: "local-user",
      counterparty_participant_ref: "meeting-counterparty",
    });
    expect(lines).toEqual([
      "Promise: Send the proposal",
      "Direction: We owe them",
      "Due: Aug 1, 2026",
      "Quote: I will send the proposal.",
    ]);
    const joined = lines.join("\n");
    expect(joined).not.toMatch(/promised_by_me|user_confirmed|session-1|local-user|meeting-counterparty|true/);
    expect(
      activityEvidenceLines(null, {
        commitment_text: "Send the quay quote",
        evidence_quote: "Send the quay quote",
        commitment_direction: "promised_by_them",
      }),
    ).toEqual(["Promise: Send the quay quote", "Direction: They owe us"]);
    expect(
      activityLinesBesideSummary(
        ["Promise: Send the quay quote", "Direction: They owe us", "Due: Oct 20, 2026"],
        "Send the quay quote",
      ),
    ).toEqual(["Direction: They owe us", "Due: Oct 20, 2026"]);
    expect(
      activityLinesBesideSummary(
        ["Promise: Send the proposal", "Quote: I will send the proposal."],
        "User decided a proposed conversation change.",
      ),
    ).toEqual(["Promise: Send the proposal", "Quote: I will send the proposal."]);
    expect(
      activityEvidenceLines(null, { commitment_direction: "promised_by_them" }),
    ).toEqual(["Direction: They owe us"]);
    expect(activityEvidenceLines(null, { commitment_direction: "mutual" })).toEqual([
      "Direction: We both owe",
    ]);
    expect(
      activityEvidenceLines(null, {
        owner_participant_ref: "Avery Chen",
        counterparty_participant_ref: "buyer@acme.example",
      }),
    ).toEqual(["From: Avery Chen", "To: buyer@acme.example"]);
    expect(
      activityEvidenceLines(null, {
        commitment_text: "Send the proposal",
        commitment_owner: "me",
        commitment_status: "open",
        commitment_due_phrase: "by Friday",
        commitment_direction: "promised_by_me",
      }),
    ).toEqual([
      "Promise: Send the proposal",
      "We made this promise",
      "This promise is still open",
      "They said: by Friday",
      "Direction: We owe them",
    ]);
    expect(activityEvidenceLines(null, { commitment_owner: "them", commitment_status: "dropped" })).toEqual([
      "They made this promise",
      "This promise was dropped",
    ]);
    expect(activityEvidenceLines(null, { commitment_owner: "local-user", commitment_status: "fulfilled" })).toEqual([
      "We made this promise",
      "This promise was kept",
    ]);
    expect(activityEvidenceLines(null, { commitment_status: "done" })).toEqual(["This promise is done"]);
    expect(activityEvidenceLines(null, { commitment_status: "cancelled" })).toEqual([
      "This promise was called off",
    ]);
    expect(activityEvidenceLines(null, { commitment_status: "missed" })).toEqual(["This promise was missed"]);
    expect(activityEvidenceLines(null, { commitment_status: "waived" })).toEqual(["This promise was waived"]);
    expect(activityEvidenceLines(null, { commitment_status: "superseded" })).toEqual([
      "This promise was replaced",
    ]);
    expect(
      activityEvidenceLines(null, {
        commitment_owner: "speaker_2",
        commitment_status: "local-user",
        commitment_due_phrase: "local-user",
      }),
    ).toEqual(["Nothing else was saved with this activity."]);
    expect(
      activityEvidenceLines(null, {
        commitment_owner: "me",
        commitment_status: "open",
        commitment_due_phrase: "by Friday",
      }).join("\n"),
    ).not.toMatch(/Commitment Owner|Commitment Status|Commitment Due Phrase|\bme\b|local-user/);
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
    expect(
      sourceConnectionLabel({ source: "meeting", status: "stale", completeness: "stale" }),
    ).toBe("Out of date");
    expect(
      sourceConnectionLabel({ source: "desktop_note", status: "stale", completeness: "stale" }),
    ).toBe("Out of date");
    expect(sourceConnectionLabel({ source: "user", status: "stale" })).toBe("Out of date");
    expect(sourceConnectionLabel({ source: "google", status: "not_connected" })).toBe(
      "Not connected",
    );
    expect(sourceConnectionLabel({ source: "slack", status: "not_connected" })).not.toBe(
      "Sync incomplete",
    );
  });

  it("prints gmail flags as the words true and false", () => {
    expect(
      activityEvidenceLines(null, {
        has_attachments: true,
        is_first_contact: false,
        subject_present: true,
      }),
    ).toEqual(["Includes an attachment", "Not the first email", "Subject is filled in"]);
    expect(
      activityEvidenceLines(null, {
        has_attachments: false,
        is_first_contact: true,
        subject_present: false,
      }),
    ).toEqual(["No attachments", "First email in this thread", "Subject was left blank"]);
    expect(activityEvidenceLines(null, { has_attachments: 1 })).toEqual(["Has Attachments: 1"]);
    expect(activityLinesBesideSummary(["Includes an attachment"], "Includes an attachment")).toEqual(
      [],
    );
    expect(activityLinesBesideSummary(["Includes an attachment"], "true")).toEqual([
      "Includes an attachment",
    ]);
  });

  it("names the first and last message by the UTC day", () => {
    expect(
      activityEvidenceLines(null, {
        first_message_at: "2026-10-04T15:04:05.123Z",
        last_message_at: "2026-08-01T00:30:00Z",
        occurred_at_clamped: true,
      }),
    ).toEqual(["First message: Oct 4, 2026", "Last message: Aug 1, 2026"]);
    expect(activityEvidenceLines(null, { first_message_at: "not-a-date" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(activityLinesBesideSummary(["First message: Oct 4, 2026"], "Oct 4, 2026")).toEqual([]);
  });

  it("prints roster counts and hides gmail ids", () => {
    const lines = activityEvidenceLines(null, {
      thread_id: "18abc",
      message_id: "18def",
      attachment_count: 1,
      participant_count: 3,
      external_participant_count: 2,
    });
    expect(lines).toEqual([
      "1 file attached to this activity",
      "3 people on this activity",
      "2 people outside the company",
    ]);
    expect(lines.join("\n")).not.toMatch(/18abc|18def|Thread Id|Message Id|Attachment Count/);
    expect(activityEvidenceLines(null, { attachment_count: "local-user" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(
      activityLinesBesideSummary(
        ["1 file attached to this activity"],
        "1 file attached to this activity",
      ),
    ).toEqual([]);
    expect(activityLinesBesideSummary(["1 file attached to this activity"], "1")).toEqual([
      "1 file attached to this activity",
    ]);
  });

  it("names calendar attendance without the event id", () => {
    expect(activityHeading("calendar", "meeting_attendance_recorded")).toBe(
      "Calendar · Attendance",
    );
    expect(
      activityEvidenceLines(null, {
        calendar_event_id: "evt_18",
        meeting_title: "Q3 review",
        attendance_source: "calendar_invite",
        recorded: false,
        meeting_size: 4,
        invitee_count: 3,
        external_count: 2,
        declined_count: 1,
        external_domains: ["acme.com"],
        organizer_email: "ada@acme.com",
        capture_caveats: ["Attendance comes from the invite alone."],
      }),
    ).toEqual([
      "Meeting: Q3 review",
      "Taken from the invite",
      "No recording was saved",
      "4 people on the invite",
      "3 people invited",
      "2 people from outside the company",
      "1 person declined",
      "Outside domains: acme.com",
      "Organizer: ada@acme.com",
      "Attendance comes from the invite alone.",
    ]);
    expect(activityEvidenceLines(null, { calendar_event_id: "evt_18", recorded: 0 })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
  });

  it("names a meeting transcript without the session id", () => {
    const lines = activityEvidenceLines(null, {
      session_id: "sess-18",
      dedupe_fingerprint: "fp-18",
      meeting_title: "Q3 review",
      transcript_segments: 12,
      transcript_payload_truncated: true,
      transcription_engine: "whisper.cpp",
      transcription_model: "ggml-base.en",
      audio_retention: "untilTranscribed",
    });
    expect(lines).toEqual([
      "Meeting: Q3 review",
      "12 lines in the transcript",
      "The transcript was shortened",
      "Transcribed with whisper.cpp",
      "Model: ggml-base.en",
      "The recording is removed after transcription",
    ]);
    expect(lines.join("\n")).not.toMatch(/sess-18|fp-18|untilTranscribed|Session Id/);
    expect(activityEvidenceLines(null, { audio_retention: "always", transcript_payload_truncated: false })).toEqual([
      "The recording is kept",
    ]);
    expect(activityEvidenceLines(null, { audio_retention: "never" })).toEqual([
      "The recording is not kept",
    ]);
    expect(activityEvidenceLines(null, { transcription_engine: "local-user" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
  });

  it("names message counts without the mail row's sentence", () => {
    expect(
      activityEvidenceLines(null, {
        message_count: 4,
        outbound_count: 2,
        inbound_count: 1,
      }),
    ).toEqual([
      "4 messages in this activity",
      "2 messages sent from this mailbox",
      "1 message received from them",
    ]);
    expect(activityEvidenceLines(null, { message_count: 0, outbound_count: 1 })).toEqual([
      "0 messages in this activity",
      "1 message sent from this mailbox",
    ]);
    expect(activityEvidenceLines(null, { message_count: "local-user" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(
      activityLinesBesideSummary(["4 messages in this activity"], "4 messages in this activity"),
    ).toEqual([]);
  });

  it("names a provider and a mail direction the way the heading does", () => {
    expect(
      activityEvidenceLines(null, {
        provider: "gmail",
        direction: "outbound",
      }),
    ).toEqual(["Provider: Gmail", "Direction: Outbound"]);
    expect(activityEvidenceLines(null, { provider: "desktop_note", direction: "inbound" })).toEqual([
      "Provider: A note",
      "Direction: Inbound",
    ]);
    expect(activityEvidenceLines(null, { provider: "hubspot" })).toEqual(["Provider: HubSpot"]);
    expect(activityEvidenceLines(null, { provider: "local-user", direction: "meeting-counterparty" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(activityLinesBesideSummary(["Provider: Gmail", "Direction: Outbound"], "Gmail")).toEqual([
      "Direction: Outbound",
    ]);
  });

  it("names who speaks next without the stored reply token", () => {
    expect(activityEvidenceLines(null, { reply_state: "awaiting_reply" })).toEqual([
      "Their reply has not arrived",
    ]);
    expect(activityEvidenceLines(null, { reply_state: "needs_reply" })).toEqual([
      "We have not answered this thread",
    ]);
    expect(activityEvidenceLines(null, { reply_state: "quiet" })).toEqual([
      "No reply is outstanding",
    ]);
    expect(activityEvidenceLines(null, { reply_state: "local-user" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(
      activityLinesBesideSummary(["Their reply has not arrived"], "Their reply has not arrived"),
    ).toEqual([]);
  });

  it("names a bounce without the stored departure token", () => {
    expect(activityEvidenceLines(null, { departure_kind: "left_organization" })).toEqual([
      "Left this company",
    ]);
    expect(activityEvidenceLines(null, { departure_kind: "recipient_unknown" })).toEqual([
      "Address was not recognized",
    ]);
    expect(activityEvidenceLines(null, { departure_kind: "local-user" })).toEqual([
      "Nothing else was saved with this activity.",
    ]);
    expect(activityLinesBesideSummary(["Left this company"], "Left this company")).toEqual([]);
  });
});
