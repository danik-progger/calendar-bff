import { test, expect } from "bun:test";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../src/auth.ts";
import { createApiHandler } from "../src/handler.ts";

const database = process.env.BFF_TEST_DATABASE_URL;
if (database && !["127.0.0.1", "localhost"].includes(new URL(database).hostname)) {
  throw new Error("BFF tests require a disposable loopback database.");
}

test.skipIf(!database)(
  "standalone BFF supports cookies, native bearer sessions, CSRF protection, and revocation",
  async () => {
    let handler = async (_req, res) => {
      res.writeHead(503).end();
    };
    const server = createServer((req, res) => {
      void handler(req, res).catch(() => {
        res.writeHead(503).end();
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const auth = await createAuth(base, {
      DATABASE_URL: database,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    });
    try {
      await (await getMigrations(auth.options)).runMigrations();
      handler = createApiHandler(auth, "http://127.0.0.1:1");
      const response = await fetch(`${base}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({
          email: `${crypto.randomUUID()}@example.test`,
          password: "standalone-bff-test-password",
          name: "BFF test",
        }),
      });
      expect(response.status).toBe(200);
      const token = response.headers.get("set-auth-token");
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      expect(token).toBeTruthy();
      expect(cookie).toBeTruthy();
      const user = (await response.json()).user;
      for (const headers of [{ Cookie: cookie }, { Authorization: `Bearer ${token}` }]) {
        const session = await fetch(`${base}/api/auth/get-session`, { headers });
        expect(session.status).toBe(200);
        expect((await session.json()).user.id).toBe(user.id);
      }
      expect((await fetch(`${base}/healthz`)).status).toBe(204);
      expect((await fetch(`${base}/api/v1/events`)).status).toBe(401);
      expect(
        (
          await fetch(`${base}/api/v1/events`, {
            method: "POST",
            headers: { Cookie: cookie, Origin: "https://attacker.example" },
          })
        ).status,
      ).toBe(403);
      const logout = await fetch(`${base}/api/auth/sign-out`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(logout.status).toBe(200);
      expect(
        (await fetch(`${base}/api/v1/events`, { headers: { Authorization: `Bearer ${token}` } }))
          .status,
      ).toBe(401);
      expect(
        await (await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: cookie } })).json(),
      ).toBeNull();
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await auth.options.database.end();
    }
  },
  30_000,
);
