import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_storage";
import {
  deliverySchema,
  matterIntakeSchema,
  openMatterIntake,
  recordSignedDelivery,
} from "./legal_matter_workflow";

async function jsonBody(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/matter-intakes") {
      const input = matterIntakeSchema.parse(await jsonBody(request));
      return send(response, 201, await openMatterIntake(input));
    }

    const delivery = request.url?.match(/^\/matter-intakes\/([^/]+)\/delivery$/);
    if (request.method === "POST" && delivery) {
      const input = deliverySchema.parse(await jsonBody(request));
      return send(
        response,
        200,
        await recordSignedDelivery(
          decodeURIComponent(delivery[1]),
          input.parts.map(({ part_number, etag }) => ({ part_number, etag })),
        ),
      );
    }
    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      return send(response, 400, { error: "Invalid request", issues: error.issues });
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.message, detail: error.detail });
    }
    return send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Matter intake service listening on http://localhost:${port}`));
