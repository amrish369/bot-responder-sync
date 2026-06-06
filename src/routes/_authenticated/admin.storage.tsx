import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStorageHealth } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/storage")({ component: StoragePage });

function StoragePage() {
  const get = useServerFn(getStorageHealth);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "storage"], queryFn: () => get(),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  const d: any = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Storage Health</h1>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Storage channel</div>
          <div className="font-mono text-lg">{d?.storage_channel_id}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Auto-delete</div>
          <div className="text-lg">{d?.autodelete_status ? `ON · ${d.autodelete_timer}s` : "OFF"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Movies</div>
          <div>archived <b>{d?.movies?.archived}</b> · legacy <b className="text-amber-600">{d?.movies?.legacy}</b> · total {d?.movies?.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Delete queue size</div>
          <div className="text-lg">{d?.delete_queue_size}</div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Per-bot storage access</h2>
        <div className="space-y-2">
          {(d?.bots ?? []).map((b: any) => (
            <div key={b.id} className="flex items-center gap-3 border-b last:border-0 pb-2">
              {b.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium">{b.name} {b.username && <span className="text-muted-foreground">@{b.username}</span>}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {b.ok ? `Admin (${b.status})` : (b.reason || "Not admin in storage channel")}
                </div>
              </div>
            </div>
          ))}
          {(d?.bots ?? []).length === 0 && <div className="text-sm text-muted-foreground">No bots configured.</div>}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Every bot needs admin rights in the storage channel so it can copyMessage files.</p>
      </Card>
    </div>
  );
}