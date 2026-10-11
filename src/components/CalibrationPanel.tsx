import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown } from "lucide-react";

type Test = { status: "pass" | "fail" | "skipped"; reason?: string; [k: string]: unknown };
interface Result { poker_fields: number; tests: { domain_separation: Test; contrast: Test; projection: Test } }

const NAMES: Record<keyof Result["tests"], { title: string; expect: string }> = {
  domain_separation: { title: "1 · Domänseparation", expect: "Pokerfält ligger närmare varandra än övriga fält." },
  contrast: { title: "2 · Kontrast (AA)", expect: "Två motsägande AA-råd hamnar nära men med tydlig skillnad i aggression eller spänning." },
  projection: { title: "3 · Situationsprojektion", expect: "Handens faser (preflop → river) träffar olika kluster." },
};

function detail(key: string, t: Test): string {
  if (t.status === "skipped") return String(t.reason ?? "");
  if (key === "domain_separation") return `inom ${t.within} · mot övriga ${t.between} · marginal ${t.margin}`;
  if (key === "contrast") return `likhet ${t.similarity} · aggressionsgap ${t.aggression_gap} · spänning ${t.max_truth_tension}`;
  const hits = (t.hits as { phase: string; cluster: string }[]) ?? [];
  return `${t.distinct_clusters} olika kluster: ` + hits.map((h) => `${h.phase} → ${h.cluster}`).join("; ");
}

export default function CalibrationPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error("Logga in för att köra kalibreringen.");
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/field-api/calibrate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session.access_token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRes(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="border-b border-border">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between p-4 hover:bg-secondary/30">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">Kalibrering (pokerfält)</span>
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="p-4 pt-0 flex flex-col gap-2 font-mono text-[11px]">
          <p className="text-muted-foreground">Markera pokerdokument som "Poker" i listan ovan och kör sedan testerna.</p>
          <button
            onClick={run}
            disabled={busy}
            className="self-start px-2 py-1 rounded border border-primary/30 text-primary text-[10px] uppercase hover:bg-primary/10 disabled:opacity-50"
          >{busy ? "Kör… (ca 20 s)" : "Kör kalibrering"}</button>
          {err && <p className="text-destructive">{err}</p>}
          {res && (Object.keys(NAMES) as (keyof Result["tests"])[]).map((k) => {
            const t = res.tests[k];
            const color = t.status === "pass" ? "text-field-fy" : t.status === "fail" ? "text-field-fz" : "text-muted-foreground";
            return (
              <div key={k} className="rounded border border-border p-2 bg-secondary/20">
                <div className="flex justify-between">
                  <span className="text-foreground">{NAMES[k].title}</span>
                  <span className={`uppercase ${color}`}>{t.status === "pass" ? "godkänt" : t.status === "fail" ? "underkänt" : "hoppat över"}</span>
                </div>
                <div className="text-muted-foreground/80 text-[10px]">{NAMES[k].expect}</div>
                <div className="text-muted-foreground text-[10px] mt-1">{detail(k, t)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
