import { describe, expect, it } from "vitest";

import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";

describe("comboboxFilterName", () => {
  it("keeps the category when a choice is selected", () => {
    expect(comboboxFilterName("Status", "All statuses")).toBe("Status, All statuses");
    expect(comboboxFilterName("Status", "Failed")).toBe("Status, Failed");
    expect(comboboxFilterName("Where it runs", "Cloud or desktop")).toBe(
      "Where it runs, Cloud or desktop",
    );
  });

  it("falls back to the category when the choice is blank", () => {
    expect(comboboxFilterName("Health", "   ")).toBe("Health");
  });
});
