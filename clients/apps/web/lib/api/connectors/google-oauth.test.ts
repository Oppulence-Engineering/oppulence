import { describe, expect, it } from "vitest";

import { googleStartFailureMessage } from "@/lib/api/connectors/google-oauth";

describe("googleStartFailureMessage", () => {
  it("uses the sentence from the start error page", () => {
    const body =
      '<!doctype html><meta charset=utf-8><title>Oppulence</title><p style="font:14px system-ui;margin:3rem">Google sign-in isn\'t configured on the server yet.</p>';
    expect(googleStartFailureMessage(body)).toBe(
      "Google sign-in isn't configured on the server yet.",
    );
  });

  it("decodes an ampersand and refuses markup", () => {
    expect(googleStartFailureMessage("<p>Mail &amp; Calendar</p>")).toBe("Mail & Calendar");
    expect(googleStartFailureMessage("<p>not &lt;script&gt;</p>")).toBe(
      "Google authorization could not be started.",
    );
  });

  it("does not surface a body that is not a short sentence", () => {
    expect(googleStartFailureMessage('{"detail":"nope"}')).toBe(
      "Google authorization could not be started.",
    );
    expect(googleStartFailureMessage("<p>" + "x".repeat(200) + "</p>")).toBe(
      "Google authorization could not be started.",
    );
  });
});
