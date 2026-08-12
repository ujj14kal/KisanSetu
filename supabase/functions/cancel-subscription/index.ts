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
    const supabaseSecretKey = getSupabaseSecretKey();
    if (!supabaseUrl || !supabaseAnonKey || !supabaseSecretKey) {
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

    const admin = createClient(
      supabaseUrl,
      supabaseSecretKey
    );

    // Fetch the Razorpay subscription ID stored at payment time
    const { data: profile, error: fetchErr } = await admin
      .from("profiles")
      .select("razorpay_subscription_id")
      .eq("id", user.id)
      .single();

    if (fetchErr || !profile?.razorpay_subscription_id) {
      return json(req, { error: "No active subscription found" }, 404);
    }

    const keyId = getEnv(["RAZORPAY_KEY_ID", "RAZORPAY_PUBLIC_KEY", "RAZORPAY_KEY"]);
    const keySecret = getEnv(["RAZORPAY_KEY_SECRET", "RAZORPAY_SECRET", "RAZORPAY_SECRET_KEY"]);
    if (!keyId || !keySecret) {
      const missing = [
        !keyId && "RAZORPAY_KEY_ID",
        !keySecret && "RAZORPAY_KEY_SECRET",
      ].filter(Boolean);
      return json(req, { error: "Server misconfiguration", missing }, 500);
    }

    // Cancel the subscription at Razorpay (cancel_at_cycle_end=1 lets it run until period end)
    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${profile.razorpay_subscription_id}/cancel`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      }
    );

    if (!rzpRes.ok) {
      const rzpErr = await rzpRes.json();
      return json(req, {
        error: rzpErr.error?.description || "Razorpay cancel failed",
        code: rzpErr.error?.code,
      }, 500);
    }

    // Mark subscription as cancelled in DB — no webhook needed for this signal
    await admin
      .from("profiles")
      .update({ subscription_active: false, razorpay_subscription_id: null })
      .eq("id", user.id);

    return json(req, { success: true });
  } catch (err) {
    return json(req, { error: (err as Error).message }, 500);
  }
});
