import assert from "node:assert/strict";
import test from "node:test";
import { decideDeadlineFollowup, matterIntakeSchema } from "../src/legal_matter_workflow";

test("marks a signed-document deadline for follow-up inside the 24-hour window", () => {
  const decision = decideDeadlineFollowup(
    "2026-10-03T09:00:00.000Z",
    new Date("2026-10-02T10:00:00.000Z"),
  );

  assert.deepEqual(decision, {
    status: "follow_up_due",
    followUpAt: "2026-10-02T09:00:00.000Z",
  });
});

test("rejects an intake without a positive media size", () => {
  const parsed = matterIntakeSchema.safeParse({
    matterId: "RIVERA-2026-014",
    originalFilename: "signed.mp4",
    sizeBytes: 0,
    partSizeBytes: 5_242_880,
    signedDocumentDueAt: "2026-10-03T09:00:00.000Z",
  });

  assert.equal(parsed.success, false);
});
