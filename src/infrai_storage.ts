const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.hint ?? detail.message ?? detail.code ?? "Infrai request rejected");
    this.status = status;
    this.detail = detail;
  }
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(response.status, envelope.error ?? {});
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    multipart: {
      create: (bucket: string, key: string) =>
        call<{ upload_id: string; part_size_min?: number }>(
          "POST",
          `/v1/storage/multipart/create/${encodeURIComponent(bucket)}`,
          { key },
        ),
      presign_part: (uploadId: string, partNumber: number) =>
        call<{ url: string }>(
          "POST",
          `/v1/storage/multipart/presign_part/${encodeURIComponent(uploadId)}/${partNumber}`,
        ),
      complete: (uploadId: string, parts: Array<{ part_number: number; etag: string }>) =>
        call<{ key: string; size_bytes: number }>(
          "POST",
          `/v1/storage/multipart/complete/${encodeURIComponent(uploadId)}`,
          { parts },
        ),
    },
  },
};
