import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBotSettings, updateBotSettings, drainDeleteQueue } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: SettingsPage });

function SettingsPage() {
  const get = useServerFn(getBotSettings);
  const upd = useServerFn(updateBotSettings);
  const drain = useServerFn(drainDeleteQueue);
  const { data, refetch, isLoading } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => get() });
  const [s, setS] = useState<any>(null);

  useEffect(() => { if (data) setS(data); }, [data]);

  const save = async () => {
    if (!s) return;
    try {
      await upd({ data: {
        autodelete_status: !!s.autodelete_status,
        autodelete_timer: Number(s.autodelete_timer) || 180,
        force_join_link: s.force_join_link || null,
        main_group_link: s.main_group_link || null,
        backup_group_link: s.backup_group_link || null,
        storage_channel_id: Number(s.storage_channel_id),
      }});
      toast.success("Saved");
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (isLoading || !s) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Auto-delete</h2>
        <div className="flex items-center justify-between">
          <Label>Enabled</Label>
          <Switch checked={!!s.autodelete_status} onCheckedChange={(v) => setS({ ...s, autodelete_status: v })} />
        </div>
        <div>
          <Label>Delete after (seconds)</Label>
          <Input type="number" value={s.autodelete_timer ?? 180}
            onChange={(e) => setS({ ...s, autodelete_timer: e.target.value })} />
          <p className="text-xs text-muted-foreground mt-1">For 3 minutes, set 180. Cron drains the queue every minute.</p>
        </div>
        <Button variant="outline" size="sm" onClick={async () => {
          try { const r = await drain(); toast.success(`Drained: ${JSON.stringify(r)}`); }
          catch (e) { toast.error((e as Error).message); }
        }}>Run delete queue now</Button>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Force-join (strict — user must be in every chat below)</h2>
        <div>
          <Label>Primary channel (@username or t.me link)</Label>
          <Input value={s.force_join_link ?? ""} onChange={(e) => setS({ ...s, force_join_link: e.target.value })} />
        </div>
        <div>
          <Label>Main group</Label>
          <Input value={s.main_group_link ?? ""} onChange={(e) => setS({ ...s, main_group_link: e.target.value })} />
        </div>
        <div>
          <Label>Backup group</Label>
          <Input value={s.backup_group_link ?? ""} onChange={(e) => setS({ ...s, backup_group_link: e.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground">Bot must be admin in each, otherwise getChatMember fails and user is let through.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Storage channel</h2>
        <div>
          <Label>Storage channel ID (-100…)</Label>
          <Input type="number" value={s.storage_channel_id ?? ""}
            onChange={(e) => setS({ ...s, storage_channel_id: e.target.value })} />
          <p className="text-xs text-muted-foreground mt-1">All bots must be admin here so they can copyMessage files.</p>
        </div>
      </Card>

      <Button onClick={save}>Save all</Button>
    </div>
  );
}