import type { IncomingMessage, ServerResponse } from "node:http";
import { createAuth } from "../src/auth.js";
import { createApiHandler } from "../src/handler.js";

let handler: Promise<ReturnType<typeof createApiHandler>> | undefined;
export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    handler ??= (async () => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      if (!env.BETTER_AUTH_URL) throw new Error("Set BETTER_AUTH_URL.");
      return createApiHandler(await createAuth(env.BETTER_AUTH_URL, env));
    })().catch((error: unknown) => {
      handler = undefined;
      throw error;
    });
    await (
      await handler
    )(req, res);
  } catch {
    console.error("Auth service request failed");
    if (!res.headersSent)
      res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ code: "service_unavailable" }));
  }
}
