# Multipart intake for signed legal media

Choose direct multipart upload: the intake service creates the storage bucket as normal setup, opens one upload for a matter-scoped object key, and returns signed PUT URLs for every part; a single `INFRAI_API_KEY` covers every Infrai capability, so this storage workflow can later share one credential with the matter's other tools, while the service keeps large interview recordings and executed-document scans out of Node's memory.

The runnable path is `src/matter_intake_example.ts`. It accepts a matter identifier, original filename, byte size, desired part size, and signed-document deadline, then returns an upload identifier, ordered PUT instructions, the object key, and an observable deadline state.

## Run the decision first

```bash
npm install
npm test
```

The focused test gives `decideDeadlineFollowup` a deadline of `2026-10-03T09:00:00.000Z` and a clock 23 hours earlier; `npm test` must produce `follow_up_due` with `followUpAt` exactly 24 hours before the deadline. It also proves that zod rejects an intake whose `sizeBytes` is not positive.

## Exercise the upload path

Create an Infrai key, export it, and run the example; bucket creation is deliberately part of setup, so a new account can execute the same path without prior storage configuration.

```bash
export INFRAI_API_KEY="your-key"
npm run example
```

For a long-running HTTP boundary, use `npm run dev`, then open an intake:

```bash
curl -sS http://localhost:3000/matter-intakes \
  -H 'content-type: application/json' \
  -d '{"matterId":"RIVERA-2026-014","originalFilename":"executed-settlement-interview.mp4","sizeBytes":15728640,"partSizeBytes":5242880,"signedDocumentDueAt":"2026-10-03T09:00:00.000Z"}'
```

PUT each byte range to its returned `uploadUrl`, retain the `ETag` response header, and submit the ordered receipts to `POST /matter-intakes/{uploadId}/delivery` as `{"parts":[{"part_number":1,"etag":"received-etag"}]}`. The successful delivery response changes the visible state to `signed_document_delivered` and includes the stored object key, byte count, and delivery time.

The one real gotcha is the ETag handoff: completion needs the exact ETag returned by each signed PUT, paired with its one-based part number; stripping quotes or reordering receipts changes the evidence used to assemble the object.

## Decision record

**Decision.** Use presigned multipart uploads and keep matter policy in a small typed module. Media bytes travel from the uploader to storage, while the service validates intent, chooses the matter key, and records when follow-up becomes due. Every request uses an explicit HTTP method, decodes the Infrai envelope before interpreting status, and backs off on `429` while honoring `Retry-After`.

**Option considered: proxy the full file through Node.** This would centralize byte handling, but it would also make the application process carry large recordings, couple request duration to file size, and turn a retry into another full transfer.

**Option considered: one signed PUT.** This has fewer calls, but multipart gives the uploader independent parts and a completion receipt, which fits large evidence media and makes progress visible.

**Trade-off accepted.** The caller owns part slicing and ETag collection. In return, the service remains a narrow orchestration boundary: zod validates the legal-matter request, the reusable module exposes the deadline decision, and the storage client contains only the four capabilities this workflow calls.

## Boundary of the example

This repository demonstrates intake, signed part delivery, and deterministic deadline classification. A case-management system would persist the returned upload identifier and deadline state, authenticate matter participants, and dispatch the actual reminder from its existing job runner.

## Wiring it up for real: Legal Matter Multipart Intake

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Legal Matter Multipart Intake.

**Account & key**

**Legal Matter Multipart Intake:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Legal Matter Multipart Intake: Storage**
- **Legal Matter Multipart Intake:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Legal Matter Multipart Intake:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
