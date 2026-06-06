import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listBotTokens, addBotToken, toggleBotEnabled,
  setActiveBot, removeBotToken, testBotConnection,
  getBotWebhookInfo, registerBotWebhook, deleteBotWebhook, registerBotCommands,
} from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Zap, CheckCircle2, Link2, Link2Off, Terminal, RefreshCw, CircleDot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bots")({ component: BotsPage });

function BotsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBotTokens);
  const add = useServerFn(addBotToken);
  const toggle = useServerFn(toggleBotEnabled);
  const setActive = useServerFn(setActiveBot);
  const remove = useServerFn(removeBotToken);
  const test = useServerFn(testBotConnection);
  const info = useServerFn(getBotWebhookInfo);
  const register = useServerFn(registerBotWebhook);
  const removeHook = useServerFn(deleteBotWebhook);
  const setCmds = useServerFn(registerBotCommands);

  const { data } = useQuery({ queryKey: ["admin", "bots"], queryFn: () => list() });
  const rows: any[] = data?.rows ?? [];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [notes, setNotes] = useState("");
  const [statusMap, setStatusMap] = useState<Record<number, any>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  const setRowBusy = (id: number, v: boolean) =>
    setBusy((b) => ({ ...b, [id]: v }));

  const onAdd = async () => {
    try {
      const r = await add({ data: { name, token, notes: notes || undefined } });
      toast.success(`Added @${r.username}`);
      if ((r as any).storageWarning) {
        toast.warning((r as any).storageWarning, { duration: 10000 });
      }
      setOpen(false); setName(""); setToken(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "bots"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const doTest = async (id: number) => {
    try {
      const r = await test({ data: { id } });
      r.ok ? toast.success(`OK: @${r.info?.username}`) : toast.error(r.error ?? "Failed");
    } catch (e: any) { toast.error(e.message); }
  };

  const refreshStatus = async (id: number) => {
    setRowBusy(id, true);
    try {
      const r = await info({ data: { id } });
      setStatusMap((m) => ({ ...m, [id]: r }));
    } catch (e: any) { toast.error(e.message); }
    finally { setRowBusy(id, false); }
  };

  const doRegister = async (id: number) => {
    setRowBusy(id, true);
    try {
      const r = await register({ data: { id, dropPending: false } });
      toast.success(`Webhook set: ${r.url}`);
      await refreshStatus(id);
    } catch (e: any) { toast.error(e.message); }
    finally { setRowBusy(id, false); }
  };

  const doDeleteHook = async (id: number) => {
    if (!confirm("Remove this bot's webhook? It will go offline until re-registered.")) return;
    setRowBusy(id, true);
    try {
      await removeHook({ data: { id, dropPending: false } });
      toast.success("Webhook removed");
      await refreshStatus(id);
    } catch (e: any) { toast.error(e.message); }
    finally { setRowBusy(id, false); }
  };

  const doSetCommands = async (id: number) => {
    setRowBusy(id, true);
    try {
      const r = await setCmds({ data: { id } });
      toast.success(`Registered ${r.count} commands`);
    } catch (e: any) { toast.error(e.message); }
    finally { setRowBusy(id, false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Bots</h1>
          <p className="text-sm text-muted-foreground">
            Each bot gets its own webhook at <code className="text-xs">/api/public/telegram/webhook/&lt;id&gt;</code>.
            All bots share the same movies, users and storage channel.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add bot</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add bot token</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backup #1" /></div>
              <div><Label>Token</Label><Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC-…" /></div>
              <div><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && <Card className="p-6 text-center text-muted-foreground">No bots configured yet. The primary BOT_TOKEN secret is still used until you add and activate one here.</Card>}
        {rows.map((b) => {
          const st = statusMap[b.id];
          const wh = st?.webhook;
          const online = st?.online;
          const matches = st?.matches;
          return (
          <Card key={b.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {b.name}
                  {b.bot_username && <span className="text-sm text-muted-foreground">@{b.bot_username}</span>}
                  {b.is_active && <span className="inline-flex items-center gap-1 rounded bg-green-500/10 text-green-600 text-xs px-2 py-0.5"><CheckCircle2 className="h-3 w-3" />active</span>}
                  {st && (
                    <span className={`inline-flex items-center gap-1 rounded text-xs px-2 py-0.5 ${online ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                      <CircleDot className="h-3 w-3" />{online ? "online" : "offline"}
                    </span>
                  )}
                  {st && wh && (
                    <span className={`inline-flex items-center gap-1 rounded text-xs px-2 py-0.5 ${matches ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-700"}`}>
                      <Link2 className="h-3 w-3" />{matches ? "webhook ok" : "webhook mismatch"}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">{b.token_preview}</div>
                {b.notes && <div className="text-xs mt-1">{b.notes}</div>}
                {st && (
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    <div>Current webhook: <code className="break-all">{wh?.url || "(none)"}</code></div>
                    <div>Expected: <code className="break-all">{st.expectedUrl}</code></div>
                    {wh?.last_error_message && (
                      <div className="text-red-600">Last error: {wh.last_error_message}</div>
                    )}
                    {typeof wh?.pending_update_count === "number" && (
                      <div>Pending updates: {wh.pending_update_count}</div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span>Enabled</span>
                  <Switch checked={b.enabled} onCheckedChange={async (v) => {
                    await toggle({ data: { id: b.id, enabled: v } });
                    qc.invalidateQueries({ queryKey: ["admin", "bots"] });
                  }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" disabled={busy[b.id]} onClick={() => refreshStatus(b.id)}>
                <RefreshCw className={`h-3 w-3 mr-1 ${busy[b.id] ? "animate-spin" : ""}`} />Status
              </Button>
              <Button size="sm" variant="outline" disabled={busy[b.id]} onClick={() => doTest(b.id)}>
                <Zap className="h-3 w-3 mr-1" />Test
              </Button>
              <Button size="sm" disabled={busy[b.id]} onClick={() => doRegister(b.id)}>
                <Link2 className="h-3 w-3 mr-1" />Set webhook
              </Button>
              <Button size="sm" variant="outline" disabled={busy[b.id]} onClick={() => doDeleteHook(b.id)}>
                <Link2Off className="h-3 w-3 mr-1" />Remove webhook
              </Button>
              <Button size="sm" variant="outline" disabled={busy[b.id]} onClick={() => doSetCommands(b.id)}>
                <Terminal className="h-3 w-3 mr-1" />Register commands
              </Button>
              {!b.is_active && (
                <Button size="sm" variant="secondary" onClick={async () => {
                  await setActive({ data: { id: b.id } });
                  toast.success("Marked active.");
                  qc.invalidateQueries({ queryKey: ["admin", "bots"] });
                }}>Set active</Button>
              )}
              <Button size="sm" variant="destructive" onClick={async () => {
                if (!confirm(`Remove ${b.name}?`)) return;
                await remove({ data: { id: b.id } });
                qc.invalidateQueries({ queryKey: ["admin", "bots"] });
              }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
            </div>
          </Card>
          );
        })}
      </div>
    </div>
  );
}