import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

export async function createAuth(baseURL: string, env: Record<string, string>) {
  const host = new URL(baseURL).hostname;
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(host);
  if (!env.DATABASE_URL) throw new Error("Set DATABASE_URL to the Postgres connection string.");
  const secret = env.BETTER_AUTH_SECRET?.trim() || (local ? localSecret() : "");
  if (secret.length < 32) throw new Error("Set BETTER_AUTH_SECRET to at least 32 characters.");
  const googleId = env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(googleId) !== Boolean(googleSecret))
    throw new Error("Set both Google OAuth credentials.");
  const googleClients = [
    googleId,
    env.GOOGLE_IOS_CLIENT_ID?.trim(),
    env.GOOGLE_ANDROID_CLIENT_ID?.trim(),
    env.GOOGLE_DESKTOP_CLIENT_ID?.trim(),
  ].filter((value): value is string => Boolean(value));
  if (googleClients.length && !googleId)
    throw new Error("Set GOOGLE_CLIENT_ID to the web client ID first.");
  if (!local && new URL(baseURL).protocol !== "https:")
    throw new Error("BETTER_AUTH_URL must use HTTPS.");

  const auth = betterAuth({
    baseURL,
    secret,
    rateLimit: { enabled: true, storage: "database", customRules: { "/get-session": false } },
    database: new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
    plugins: [bearer()],
    trustedOrigins: [new URL(baseURL).origin],
    socialProviders:
      googleId && googleSecret
        ? { google: { clientId: googleClients, clientSecret: googleSecret } }
        : {},
    advanced: {
      cookiePrefix: "calendar-web",
      ipAddress: {
        ipAddressHeaders:
          env.VERCEL === "1" ? ["x-vercel-forwarded-for"] : ["x-calendar-client-ip"],
      },
    },
  });

  return auth;
}

function localSecret() {
  mkdirSync(".data", { recursive: true, mode: 0o700 });
  const path = ".data/web-auth.secret";
  try {
    writeFileSync(path, randomBytes(32).toString("base64"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readFileSync(path, "utf8").trim();
}
