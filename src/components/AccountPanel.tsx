import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SHARE_PREF_KEY = "share_to_global_default";

export function getShareToGlobalDefault(): boolean {
  try { return localStorage.getItem(SHARE_PREF_KEY) === "1"; } catch { return false; }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function AccountPanel() {
  const { user, signOut } = useAuth();
  const [shareDefault, setShareDefault] = useState(getShareToGlobalDefault());
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`;

  useEffect(() => {
    void loadKeys();
  }, []);

  async function loadKeys() {
    const { data } = await supabase.from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    setKeys(data ?? []);
  }

  function toggleShare(v: boolean) {
    setShareDefault(v);
    try { localStorage.setItem(SHARE_PREF_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }

  async function claimLegacy() {
    const { data, error } = await supabase.rpc("claim_orphan_documents");
    if (error) { toast.error(error.message); return; }
    toast.success(`Claimed ${data} legacy document(s)`);
  }

  async function createKey() {
    if (!keyName.trim()) { toast.error("Name required"); return; }
    const raw = "gft_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const hash = await sha256Hex(raw);
    const { error } = await supabase.from("api_keys").insert({
      user_id: user!.id,
      name: keyName.trim(),
      key_hash: hash,
      key_prefix: raw.slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    setNewKey(raw);
    setKeyName("");
    await loadKeys();
  }

  async function revokeKey(id: string) {
    await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    await loadKeys();
  }

  return (
    <div className="space-y-4 border-t border-border pt-4 mt-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground truncate">{user?.email}</span>
        <Button size="sm" variant="ghost" onClick={signOut}>Sign out</Button>
      </div>

      <Button size="sm" variant="outline" className="w-full" onClick={claimLegacy}>
        Claim legacy documents
      </Button>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="share-default" className="text-xs leading-snug">
          Share new uploads to <br /><span className="text-foreground">Global Field Friction Clusters</span>
          <span className="block text-muted-foreground/70 text-[10px] mt-1">
            Only cluster centroids + metrics are shared. Never raw text.
          </span>
        </Label>
        <Switch id="share-default" checked={shareDefault} onCheckedChange={toggleShare} />
      </div>

      <div className="space-y-2">
        <Label className="uppercase tracking-wide text-muted-foreground">MCP access</Label>
        <div className="font-mono break-all bg-muted/30 p-2 rounded text-[10px]">{mcpUrl}</div>
        <div className="flex gap-2">
          <Input placeholder="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" onClick={createKey}>Create</Button>
        </div>
        {newKey && (
          <div className="bg-amber-500/10 border border-amber-500/40 p-2 rounded space-y-1">
            <div className="text-amber-400 text-[10px]">Copy now — shown once</div>
            <code className="font-mono text-[10px] break-all">{newKey}</code>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied"); }}>Copy</Button>
          </div>
        )}
        {keys.length > 0 && (
          <ul className="space-y-1">
            {keys.map((k) => (
              <li key={k.id} className="flex justify-between items-center">
                <span className={k.revoked_at ? "line-through text-muted-foreground" : ""}>
                  {k.name} <span className="text-muted-foreground">({k.key_prefix}…)</span>
                </span>
                {!k.revoked_at && (
                  <button onClick={() => revokeKey(k.id)} className="text-muted-foreground hover:text-destructive text-[10px]">revoke</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
