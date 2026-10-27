import { describe, expect, it } from "vitest";

import { CreateRevenueAction201Response } from "@/lib/api/generated/zod/revenue/revenue";

describe("create revenue action response", () => {
  it("accepts the sentence the API stores as the reason", () => {
    const parsed = CreateRevenueAction201Response.parse({
      id: "aa85ea13-e767-4412-8e08-1cbbbf5a1511",
      actionType: "follow_up_task",
      channel: "task",
      detector: "manual",
      revision: 1,
      revisionHash: "sha256:6050a71e69472355b39537ab430bc41f588b5bf9da568d60b4f905cf7eba4799",
      reason: "Follow up on company: Dogfood Quay",
      proposedMessage: "Review and follow up on Dogfood Quay.",
      priorityScore: 0,
      queueStatus: "open",
      policyStatus: "pending",
      approvalStatus: "pending",
      executionStatus: "pending",
      executionOwner: "rowboat",
      executionMode: "draft",
      createdAt: "2026-09-30T12:47:49.682267116Z",
      updatedAt: "2026-09-30T12:47:49.682267726Z",
      evidence: [],
    });

    expect(parsed.reason).toBe("Follow up on company: Dogfood Quay");
  });
});
