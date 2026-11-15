import { useState } from "react";
import { Copy, Mail, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MCP_ACCESS_LEVELS, MCP_CONTACT_EMAIL, buildMcpAccessRequest } from "@/lib/mcpAccess";
import { toast } from "sonner";

export default function McpAccessPanel() {
  const [level, setLevel] = useState("1");
  const [agent, setAgent] = useState("");
  const [resource, setResource] = useState("");
  const [purpose, setPurpose] = useState("");
  const [globalFederation, setGlobalFederation] = useState(false);
  const ready = Boolean(agent.trim() && resource.trim() && purpose.trim());
  const request = () => buildMcpAccessRequest({ level: Number(level), agent, resource, purpose, globalFederation });

  return (
    <section aria-label="MCP åtkomstnivåer" className="space-y-3 text-xs">
      <h3 className="flex items-center gap-2 font-mono text-foreground"><Network className="h-4 w-4" /> MCP · Åtkomstnivåer</h3>
      <ol className="divide-y divide-border">
        {MCP_ACCESS_LEVELS.map((tier) => (
          <li key={tier.level} className="py-3 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="font-medium">{tier.level} · {tier.role}</span>
              <span className="text-[10px] text-muted-foreground">{tier.planned ? "Planerad MCP-utökning" : "Befintliga MCP-verktyg"}</span>
            </div>
            <p className="text-muted-foreground">{tier.scope}</p>
            <p className="font-mono text-[10px] leading-relaxed break-words text-primary">{tier.tools.join(" · ")}</p>
          </li>
        ))}
      </ol>
      <div className="border-y border-border py-3 space-y-1">
        <p className="font-medium">Separat flagga · Global Federation</p>
        <p className="text-muted-foreground">Söka i eller dela till Global Field Friction Clusters. Endast uttryckligen delade kluster; aldrig råtext.</p>
        <p className="font-mono text-[10px] text-primary break-words">search_global_friction · befintligt sökverktyg</p>
        <p className="text-muted-foreground">Nivåer, resursavgränsning och global flagga är föreslagna behörigheter, ännu inte spärrar på befintliga nycklar.</p>
      </div>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (ready) window.location.href = request().mailto; }}>
        <h4 className="font-medium">Ansök om åtkomst</h4>
        <div className="space-y-1">
          <Label htmlFor="mcp-request-level">Önskad nivå</Label>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger id="mcp-request-level" className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MCP_ACCESS_LEVELS.map((tier) => <SelectItem key={tier.level} value={String(tier.level)}>{tier.level} · {tier.role}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label htmlFor="mcp-request-agent">Agent / app</Label><Input id="mcp-request-agent" value={agent} onChange={(e) => setAgent(e.target.value)} required maxLength={160} className="text-xs" /></div>
        <div className="space-y-1"><Label htmlFor="mcp-request-resource">Specifik resurs / fält</Label><Input id="mcp-request-resource" value={resource} onChange={(e) => setResource(e.target.value)} required maxLength={300} className="text-xs" /></div>
        <div className="space-y-1"><Label htmlFor="mcp-request-purpose">Syfte och önskade åtgärder</Label><Textarea id="mcp-request-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} required maxLength={1500} className="text-xs" /></div>
        <div className="flex items-center justify-between gap-3"><Label htmlFor="mcp-request-global" className="text-xs">Begär Global Federation</Label><Switch id="mcp-request-global" checked={globalFederation} onCheckedChange={setGlobalFederation} /></div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={!ready}><Mail className="h-3 w-3 mr-2" />Öppna mejlansökan</Button>
          <Button type="button" variant="outline" size="sm" disabled={!ready} onClick={async () => {
            try { const data = request(); await navigator.clipboard.writeText(`Till: ${MCP_CONTACT_EMAIL}\nÄmne: ${data.subject}\n\n${data.body}`); toast.success("Ansökan kopierad — inte skickad"); }
            catch { toast.error("Kunde inte kopiera ansökan"); }
          }}><Copy className="h-3 w-3 mr-2" />Kopiera</Button>
        </div>
        <a href={`mailto:${MCP_CONTACT_EMAIL}`} className="block break-all text-primary underline">{MCP_CONTACT_EMAIL}</a>
        <p className="text-muted-foreground text-[10px]">Mejlansökan skickas från din mejlapp. Ingen åtkomst beviljas automatiskt; planerade verktyg kräver fortsatt utveckling.</p>
      </form>
    </section>
  );
}