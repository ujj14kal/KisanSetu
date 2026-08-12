import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://kisansetu.in",
  "https://www.kisansetu.in",
  "https://kisan-setu-vert.vercel.app",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://kisansetu.in";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function getEnv(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

function getSupabasePublishableKey() {
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys);
      if (parsed?.default) return parsed.default;
    } catch {
      // Fall back to legacy env below.
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY");
}

function getSupabaseSecretKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed?.default) return parsed.default;
    } catch {
      // Fall back to legacy env below.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = getSupabasePublishableKey();
    if (!supabaseUrl || !supabaseAnonKey) {
      return json(req, { error: "Server misconfiguration", missing: "Supabase API key" }, 500);
    }

    const anonClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const { payment_id, subscription_id, signature } = await req.json();

    if (!payment_id || !subscription_id || !signature) {
      return json(req, { error: "Missing required fields" }, 400);
    }

    const razorpaySecret = getEnv(["RAZORPAY_KEY_SECRET", "RAZORPAY_SECRET", "RAZORPAY_SECRET_KEY"]);
    if (!razorpaySecret) {
      return json(req, { error: "Server misconfiguration", missing: "RAZORPAY_KEY_SECRET" }, 500);
    }

    // Razorpay subscription verification uses the server-created subscription ID.
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw", encoder.encode(razorpaySecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(`${payment_id}|${subscription_id}`));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    if (expectedSignature !== signature) {
      return json(req, { error: "Invalid payment signature" }, 400);
    }

    const supabaseSecretKey = getSupabaseSecretKey();
    if (!supabaseSecretKey) {
      return json(req, { error: "Server misconfiguration", missing: "Supabase service key" }, 500);
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseSecretKey
    );

    const { error } = await supabase
      .from("profiles")
      .update({ subscription_active: true, razorpay_subscription_id: subscription_id })
      .eq("id", user.id);

    if (error) {
      return json(req, { error: error.message }, 500);
    }

    return json(req, { success: true });
  } catch (err) {
    return json(req, { error: (err as Error).message }, 500);
  }
});
