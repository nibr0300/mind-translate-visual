import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

// Google-native MIME → export target
const EXPORT_MAP: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "text/plain", ext: "txt" },
  "application/vnd.google-apps.spreadsheet": { mime: "text/csv", ext: "csv" },
  "application/vnd.google-apps.presentation": { mime: "text/plain", ext: "txt" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing bearer" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.slice(7);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const DRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!LOVABLE_API_KEY || !DRIVE_KEY) {
      return json({ error: "Google Drive connector not linked" }, 503);
    }

    const url = new URL(req.url);
    const fileId = url.searchParams.get("fileId");
    if (!fileId) return json({ error: "fileId required" }, 400);

    const gwHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
    };

    // Get metadata first
    const metaRes = await fetch(
      `${GATEWAY}/files/${fileId}?fields=id,name,mimeType,size`,
      { headers: gwHeaders },
    );
    if (!metaRes.ok) {
      return json({ error: `Meta ${metaRes.status}`, details: await metaRes.text() }, metaRes.status);
    }
    const meta = await metaRes.json();
    let name: string = meta.name ?? "file";
    let mime: string = meta.mimeType ?? "application/octet-stream";

    let downloadRes: Response;
    if (EXPORT_MAP[mime]) {
      const tgt = EXPORT_MAP[mime];
      downloadRes = await fetch(
        `${GATEWAY}/files/${fileId}/export?mimeType=${encodeURIComponent(tgt.mime)}`,
        { headers: gwHeaders },
      );
      mime = tgt.mime;
      if (!name.toLowerCase().endsWith("." + tgt.ext)) name = `${name}.${tgt.ext}`;
    } else {
      downloadRes = await fetch(`${GATEWAY}/files/${fileId}?alt=media`, { headers: gwHeaders });
    }

    if (!downloadRes.ok) {
      return json({ error: `Download ${downloadRes.status}`, details: await downloadRes.text() }, downloadRes.status);
    }

    return new Response(downloadRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "X-File-Name": encodeURIComponent(name),
        "X-File-Mime": mime,
      },
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
