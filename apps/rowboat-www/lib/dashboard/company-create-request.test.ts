import { beforeEach, describe, expect, it } from "vitest";

import {
  openCompanyCreate,
  requestCompanyCreate,
  subscribeCompanyCreate,
} from "@/lib/dashboard/company-create-request";

describe("company create request", () => {
  beforeEach(() => {
    const drain = subscribeCompanyCreate(() => {});
    drain();
  });

  it("opens New company when Companies mounts later", () => {
    let opened = 0;
    requestCompanyCreate();
    const unsubscribe = subscribeCompanyCreate(() => {
      opened += 1;
    });
    expect(opened).toBe(1);
    unsubscribe();
    const again = subscribeCompanyCreate(() => {
      opened += 1;
    });
    expect(opened).toBe(1);
    again();
  });

  it("opens New company when Companies is already showing", () => {
    let opened = 0;
    const unsubscribe = subscribeCompanyCreate(() => {
      opened += 1;
    });
    requestCompanyCreate();
    requestCompanyCreate();
    expect(opened).toBe(2);
    unsubscribe();
  });

  it("switches to Companies after remembering the request", () => {
    let opened = 0;
    const openCompanies = () => {
      opened += 1;
    };
    openCompanyCreate(openCompanies);
    expect(opened).toBe(1);
    const unsubscribe = subscribeCompanyCreate(() => {
      opened += 1;
    });
    expect(opened).toBe(2);
    unsubscribe();
  });
});
