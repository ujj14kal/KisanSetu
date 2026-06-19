import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://kisansetu.in";

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the Razorpay subscription ID stored at payment time
    const { data: profile, error: fetchErr } = await admin
      .from("profiles")
      .select("razorpay_subscription_id")
      .eq("id", user.id)
      .single();

    if (fetchErr || !profile?.razorpay_subscription_id) {
      return new Response(JSON.stringify({ error: "No active subscription found" }), {
        status: 404, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: rzpErr.error?.description || "Razorpay cancel failed" }), {
        status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    // Mark subscription as cancelled in DB — no webhook needed for this signal
    await admin
      .from("profiles")
      .update({ subscription_active: false, razorpay_subscription_id: null })
      .eq("id", user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...cors(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
});
