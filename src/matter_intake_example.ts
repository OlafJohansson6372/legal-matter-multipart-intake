import { matterIntakeSchema, openMatterIntake } from "./legal_matter_workflow";

const intake = matterIntakeSchema.parse({
  matterId: "RIVERA-2026-014",
  originalFilename: "executed-settlement-interview.mp4",
  sizeBytes: 15_728_640,
  partSizeBytes: 5_242_880,
  signedDocumentDueAt: "2026-10-03T09:00:00.000Z",
});

const result = await openMatterIntake(intake);
console.log(JSON.stringify(result, null, 2));
