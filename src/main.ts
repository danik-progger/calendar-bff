import { createServer } from "node:http";
import { createAuth } from "./auth";
import { createApiHandler } from "./handler";
import { environment } from "./environment";

const env = environment();
const baseURL = env.BETTER_AUTH_URL || "http://127.0.0.1:5174";
const auth = await createAuth(baseURL, env);
const handler = createApiHandler(auth, env.CALENDAR_API_URL || "http://127.0.0.1:8080");
const server = createServer(async (req, res) => {
  try {
    await handler(req, res);
  } catch {
    console.error("HTTP request failed");
    if (!res.headersSent) res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "service_unavailable" }));
  }
});
server.requestTimeout = 15_000;
server.listen(Number(env.PORT || "3001"), env.HOST || "127.0.0.1", () =>
  console.info("Calendar BFF listening"),
);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    void auth.options.database.end().catch(() => {
      process.exitCode = 1;
    });
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
