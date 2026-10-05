import { z } from "zod";
import { infrai } from "./infrai_storage";

export const matterIntakeSchema = z.object({
  matterId: z.string().trim().min(1).max(80),
  originalFilename: z.string().trim().min(1).max(180),
  sizeBytes: z.number().int().positive(),
  partSizeBytes: z.number().int().positive(),
  signedDocumentDueAt: z.string().datetime(),
});

export const deliverySchema = z.object({
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().trim().min(1),
  })).min(1),
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;

export type DeadlineDecision = {
  status: "on_track" | "follow_up_due";
  followUpAt: string;
};

const matterBucket = "legal-matter-media";
let bucketSetup: Promise<unknown> | undefined;

function ensureMatterBucket(): Promise<unknown> {
  bucketSetup ??= infrai.storage.bucket.create(matterBucket);
  return bucketSetup;
}

export function decideDeadlineFollowup(
  dueAt: string,
  now: Date,
  leadHours = 24,
): DeadlineDecision {
  const dueTime = new Date(dueAt).getTime();
  const followUpTime = dueTime - leadHours * 60 * 60 * 1_000;
  return {
    status: now.getTime() >= followUpTime ? "follow_up_due" : "on_track",
    followUpAt: new Date(followUpTime).toISOString(),
  };
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export async function openMatterIntake(input: MatterIntake, now = new Date()) {
  await ensureMatterBucket();

  const key = `matters/${safeSegment(input.matterId)}/signed/${safeSegment(input.originalFilename)}`;
  const created = await infrai.storage.multipart.create(matterBucket, key);
  const partCount = Math.ceil(input.sizeBytes / input.partSizeBytes);
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, index) => ({
      partNumber: index + 1,
      method: "PUT" as const,
      uploadUrl: (await infrai.storage.multipart.presign_part(created.upload_id, index + 1)).url,
    })),
  );

  return {
    matterId: input.matterId,
    uploadId: created.upload_id,
    objectKey: key,
    parts,
    deadline: decideDeadlineFollowup(input.signedDocumentDueAt, now),
  };
}

export async function recordSignedDelivery(
  uploadId: string,
  parts: Array<{ part_number: number; etag: string }>,
) {
  const document = await infrai.storage.multipart.complete(uploadId, parts);
  return {
    state: "signed_document_delivered" as const,
    objectKey: document.key,
    sizeBytes: document.size_bytes,
    deliveredAt: new Date().toISOString(),
  };
}
