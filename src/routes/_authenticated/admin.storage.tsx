import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStorageHealth, getAutoIndexInfo, setAutoIndex } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/storage")({ component: StoragePage });

function StoragePage() {
  const get = useServerFn(getStorageHealth);
  const getIdx = useServerFn(getAutoIndexInfo);
  const toggleIdx = useServerFn(setAutoIndex);
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "storage"], queryFn: () => get(),
  });
  const { data: idx } = useQuery({ queryKey: ["admin", "autoindex"], queryFn: () => getIdx() });

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Auto-index channel files</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              ON hone par storage channel me post ki gayi har video/document apne aap
              parse hokar database me add ho jati hai (title, year, language, quality,
              file size + TMDB verification).
            </p>
          </div>
          <Switch
            checked={!!idx?.auto_index}
            onCheckedChange={async (v) => {
              await toggleIdx({ data: { enabled: v } });
              toast.success(v ? "Auto-index ON" : "Auto-index OFF");
              qc.invalidateQueries({ queryKey: ["admin", "autoindex"] });
            }}
          />
        </div>
        <div className="mt-4 space-y-1 max-h-72 overflow-auto text-sm">
          {(idx?.recent ?? []).length === 0 && (
            <div className="text-muted-foreground">Abhi tak koi file auto-index nahi hui.</div>
          )}
          {(idx?.recent ?? []).map((m: any) => (
            <div key={m.id} className="flex justify-between gap-2 border-b py-1 last:border-0">
              <div className="truncate">
                <span className="font-medium">{m.title}</span>{" "}
                <span className="text-muted-foreground text-xs">
                  {m.year ?? "—"} · {m.language ?? "—"} · {m.quality ?? "—"} · {m.size ?? "—"}
                </span>
              </div>
              <div className="text-xs shrink-0 text-muted-foreground">
                {m.tmdb_verified ? "TMDB ✓" : "unverified"}
              </div>
            </div>
          ))}
        </div>
      </Card>

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