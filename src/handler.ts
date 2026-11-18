import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import type { createAuth } from "./auth";

export function createApiHandler(auth: Awaited<ReturnType<typeof createAuth>>, apiURL: string) {
  const authHandler = toNodeHandler(auth);
  const baseURL = new URL(auth.options.baseURL);
  const api = new URL(apiURL);
  if (
    (api.protocol !== "https:" &&
      !(api.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname))) ||
    api.username ||
    api.password ||
    api.pathname !== "/" ||
    api.search ||
    api.hash
  ) {
    throw new Error("CALENDAR_API_URL must be an HTTPS origin (loopback HTTP allowed).");
  }
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
    if (!path.pathname.startsWith("/api/v1/")) {
      res.writeHead(404).end();
      return;
    }
    const method = req.method || "GET";
    if (
      !["GET", "HEAD"].includes(method) &&
      !req.headers.authorization &&
      req.headers.origin !== baseURL.origin
    ) {
      res.writeHead(403).end(JSON.stringify({ code: "invalid_origin" }));
      return;
    }
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
    });
    if (!session) {
      res.writeHead(401).end(JSON.stringify({ code: "unauthorized" }));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 128 * 1024) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const upstream = new URL(path.pathname + path.search, api);
    const response = await fetch(upstream, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.token}`,
      },
      body: ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    res.statusCode = response.status;
    for (const name of ["content-type", "location", "www-authenticate"]) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
