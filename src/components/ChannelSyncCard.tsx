import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getChannelScan, runChannelScanBatch } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export function ChannelSyncCard() {
  const getScan = useServerFn(getChannelScan);
  const runBatch = useServerFn(runChannelScanBatch);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2100);
  const [p, setP] = useState<any>(null);
  const [active, setActive] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    getScan().then((r: any) => { if (r) { setP(r); setFrom(r.from); setTo(r.to); } }).catch(() => {});
  }, []);

  async function loop(reset: boolean) {
    stop.current = false;
    setActive(true);
    let first = true;
    let fails = 0;
    while (!stop.current) {
      try {
        const r: any = await runBatch({ data: { from, to, reset: first && reset } });
        first = false; fails = 0;
        setP(r);
        if (!r || r.next > r.to) { toast.success("🎉 Sync poora ho gaya!"); break; }
        await new Promise((res) => setTimeout(res, 1500));
      } catch (e: any) {
        fails++;
        if (fails >= 5) { toast.error("Sync ruk gaya: " + (e?.message || "error")); break; }
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
    setActive(false);
  }

  const total = p ? p.to - p.from + 1 : 0;
  const done = p ? Math.min(total, p.next - p.from) : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Channel Auto-Sync (purani files)</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Ek baar Start dabayein — sabhi purani files apne aap database me add ho jayengi. Ye page khula rakhein.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs">Start ID<Input type="number" value={from} disabled={active} onChange={(e) => setFrom(Number(e.target.value))} className="w-28" /></label>
        <label className="text-xs">End ID<Input type="number" value={to} disabled={active} onChange={(e) => setTo(Number(e.target.value))} className="w-28" /></label>
        {!active ? (
          <>
            <Button onClick={() => loop(true)}>▶️ Naya Sync Start</Button>
            {p && p.next <= p.to && <Button variant="outline" onClick={() => loop(false)}>⏯ Resume</Button>}
          </>
        ) : (
          <Button variant="destructive" onClick={() => { stop.current = true; }}>⏸ Pause</Button>
        )}
      </div>
      {p && (
        <div className="space-y-2">
          <Progress value={pct} />
          <div className="text-sm">{done} / {total} ({pct}%) · agla ID {p.next}{active && " · chal raha hai…"}</div>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div><b className="text-base block">{p.inserted}</b>Nayi</div>
            <div><b className="text-base block">{p.updated}</b>Update</div>
            <div><b className="text-base block">{p.skipped}</b>Pehle se</div>
            <div><b className="text-base block">{p.empty}</b>Khali</div>
            <div><b className="text-base block">{p.errors}</b>Error</div>
          </div>
        </div>
      )}
    </Card>
  );
}
