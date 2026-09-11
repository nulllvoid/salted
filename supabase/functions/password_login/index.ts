import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
const deny = () =>
  reply(400, {
    message: "The login details don’t match. Check them and try again.",
  });
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST")
    return reply(405, { message: "Method not allowed." });
  try {
    const raw = await request.text();
    if (raw.length > 2048) return deny();
    const body = JSON.parse(raw);
    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";
    const password = body.password;
    if (
      !/^[a-z][a-z0-9_]{2,29}$/.test(username) ||
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 128
    )
      return deny();
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    for (const [key, limit] of [
      [`user:${username}`, 10],
      [`ip:${ip}`, 50],
    ] as const) {
      const { data, error } = await admin.rpc("allow_password_login", {
        p_key: await hash(key),
        p_limit: limit,
      });
      if (error)
        return reply(503, {
          message:
            "Sign-in is temporarily unavailable. Use email or phone, or try again later.",
        });
      if (!data)
        return reply(429, {
          message: "Too many attempts. Try again in 15 minutes.",
        });
    }
    const { data: alias, error } = await admin
      .from("login_usernames")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();
    if (error)
      return reply(503, { message: "Sign-in is temporarily unavailable." });
    const account = alias
      ? (await admin.auth.admin.getUserById(alias.user_id)).data.user
      : null;
    // Unknown aliases also go through Auth, yielding the same public failure.
    const identity = account?.email
      ? { email: account.email }
      : account?.phone
        ? { phone: account.phone }
        : { email: `${crypto.randomUUID()}@invalid.example` };
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await client.auth.signInWithPassword({
      ...identity,
      password,
    });
    if (result.error || !result.data.session || !account) return deny();
    return reply(200, {
      access_token: result.data.session.access_token,
      refresh_token: result.data.session.refresh_token,
    });
  } catch {
    // Do not log request bodies, credentials or sessions.
    return deny();
  }
});
