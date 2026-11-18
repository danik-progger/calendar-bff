import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler } from "better-auth/node";
import type { createAuth } from "./auth.js";

export function createApiHandler(auth: Awaited<ReturnType<typeof createAuth>>) {
  const authHandler = toNodeHandler(auth);
  const baseURL = new URL(auth.options.baseURL);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url || "/", baseURL);
    res.setHeader("Cache-Control", "no-store");
    if (path.pathname === "/healthz" && ["GET", "HEAD"].includes(req.method || "GET")) {
      res.writeHead(204).end();
      return;
    }
    if (path.pathname.startsWith("/api/auth/")) {
      req.headers["x-calendar-client-ip"] = req.socket.remoteAddress;
      await authHandler(req, res);
      return;
    }
    res.writeHead(404).end();
  };
}
