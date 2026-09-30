import { describe, expect, it } from "vitest";

import {
  presentApiReferenceDocument,
  renderApiReferencePage,
} from "@/lib/api/api-reference-document";

describe("API reference document", () => {
  it("replaces the Solomon heading and leaves the rest of the spec", () => {
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
      "Oppulence API for sign-in, billing, workflows, companies, people, and evidence.",
    );
    expect(presented.info.version).toBe("0.1.0");
    expect(presented.servers[0]?.description).toBe("Current Oppulence API origin");
    expect(presented.components.schemas.ErrorEnvelope.description).toContain("Solomon AI API");
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
  });

  it("says the reference could not be loaded when the spec is missing", () => {
    const page = renderApiReferencePage(null);
    expect(page).toContain("The API reference could not be loaded.");
    expect(page).not.toContain("unpkg.com");
  });
});
