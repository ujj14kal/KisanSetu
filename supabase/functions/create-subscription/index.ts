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
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = getSupabasePublishableKey();
    if (!supabaseUrl || !supabaseAnonKey) {
      return json(req, { error: "Server misconfiguration", missing: "Supabase API key" }, 500);
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const keyId = getEnv(["RAZORPAY_KEY_ID", "RAZORPAY_PUBLIC_KEY", "RAZORPAY_KEY"]);
    const keySecret = getEnv(["RAZORPAY_KEY_SECRET", "RAZORPAY_SECRET", "RAZORPAY_SECRET_KEY"]);
    const planId = getEnv(["RAZORPAY_PLAN_ID", "RAZORPAY_SUBSCRIPTION_PLAN_ID"]);

    if (!keyId || !keySecret || !planId) {
      const missing = [
        !keyId && "RAZORPAY_KEY_ID",
        !keySecret && "RAZORPAY_KEY_SECRET",
        !planId && "RAZORPAY_PLAN_ID",
      ].filter(Boolean);
      return json(req, { error: "Server misconfiguration", missing }, 500);
    }

    const credentials = btoa(`${keyId}:${keySecret}`);

    const rzpRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        total_count: 12,
        quantity: 1,
        notify_info: { notify_email: user.email },
        notes: { user_id: user.id },
      }),
    });

    const sub = await rzpRes.json();

    if (!rzpRes.ok || !sub.id) {
      return json(req, {
        error: sub.error?.description || "Failed to create subscription",
        code: sub.error?.code,
      }, 500);
    }

    return json(req, { subscription_id: sub.id, key_id: keyId });
  } catch (err) {
    return json(req, { error: (err as Error).message }, 500);
  }
});
