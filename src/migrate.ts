import { environment } from "./environment.js";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "./auth.js";

const env = environment();
const connection = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!connection) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL.");
const auth = await createAuth(env.BETTER_AUTH_URL || "http://127.0.0.1:5174", {
  ...env,
  DATABASE_URL: connection,
});
try {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  console.info("Better Auth schema ready.");
} finally {
  await auth.options.database.end();
}
