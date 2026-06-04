import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.slice(7);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const DRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!LOVABLE_API_KEY || !DRIVE_KEY) {
      return json({
        error: "Google Drive connector not linked. Open Project Settings → Connectors → Google Drive and link the connection.",
      }, 503);
    }

    const url = new URL(req.url);
    const folderId = url.searchParams.get("folderId");
    const q = url.searchParams.get("q") ?? "";
    const pageToken = url.searchParams.get("pageToken") ?? "";

    const params = new URLSearchParams({
      pageSize: "50",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,iconLink,thumbnailLink)",
      orderBy: "modifiedTime desc",
      spaces: "drive",
    });

    const filters: string[] = ["trashed = false"];
    if (folderId) filters.push(`'${folderId}' in parents`);
    if (q) filters.push(`name contains '${q.replace(/'/g, "\\'")}'`);
    params.set("q", filters.join(" and "));
    if (pageToken) params.set("pageToken", pageToken);

    const r = await fetch(`${GATEWAY}/files?${params}`, {
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": DRIVE_KEY,
      },
    });
    const body = await r.text();
    if (!r.ok) return json({ error: `Drive API ${r.status}`, details: body }, r.status);
    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
