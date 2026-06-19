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
    // Verify caller is authenticated
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

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const planId = Deno.env.get("RAZORPAY_PLAN_ID");

    if (!keyId || !keySecret || !planId) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: sub.error?.description || "Failed to create subscription" }), {
        status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ subscription_id: sub.id }), {
      status: 200, headers: { ...cors(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
});
