import { serializeSignedCookie } from "better-call";

export async function createSessionFixture(auth) {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    email: `${crypto.randomUUID()}@example.test`,
    name: "Calendar test",
    emailVerified: true,
  });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await serializeSignedCookie(
    context.authCookies.sessionToken.name,
    session.token,
    context.secret,
  );
  return { token: session.token, cookie: cookie.split(";")[0], user };
}
