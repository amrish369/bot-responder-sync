import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats, listActivity } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Film, Users, UserCheck, UserX, Inbox, Bot, Archive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Stat({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-4 flex items-center gap-4">
      <div className="rounded-lg bg-primary/10 p-3"><Icon className="h-5 w-5 text-primary" /></div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function Dashboard() {
  const stats = useServerFn(getDashboardStats);
  const activity = useServerFn(listActivity);
  const { data: s } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => stats(), refetchInterval: 30000 });
  const { data: a } = useQuery({ queryKey: ["admin", "activity"], queryFn: () => activity() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your bot.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Film} label="Total movies" value={s?.totalMovies ?? "—"} />
        <Stat icon={Archive} label="Archived" value={s?.archivedMovies ?? "—"} />
        <Stat icon={Users} label="Total users" value={s?.totalUsers ?? "—"} />
        <Stat icon={UserCheck} label="Active (7d)" value={s?.activeUsers ?? "—"} />
        <Stat icon={UserX} label="Banned" value={s?.bannedUsers ?? "—"} />
        <Stat icon={Inbox} label="Pending requests" value={s?.pendingRequests ?? "—"} />
        <Stat icon={Bot} label="Bots configured" value={s?.totalBots ?? "—"} />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Recent broadcasts</h2>
        <div className="space-y-2 text-sm">
          {(s?.recentBroadcasts ?? []).length === 0 && <div className="text-muted-foreground">No broadcasts yet.</div>}
          {(s?.recentBroadcasts ?? []).map((b: any) => (
            <div key={b.id} className="flex justify-between border-b pb-2 last:border-0">
              <div className="truncate max-w-[60%]">{b.message}</div>
              <div className="text-muted-foreground text-xs">{b.success}/{b.total} · {new Date(b.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Activity log</h2>
        <div className="space-y-1 text-sm max-h-80 overflow-auto">
          {(a?.rows ?? []).map((r: any) => (
            <div key={r.id} className="flex justify-between gap-2 border-b py-1 last:border-0">
              <div><span className="font-mono text-xs">{r.action}</span> <span className="text-muted-foreground">· {r.admin_email}</span></div>
              <div className="text-xs text-muted-foreground shrink-0">{new Date(r.created_at).toLocaleString()}</div>
            </div>
          ))}
          {(a?.rows ?? []).length === 0 && <div className="text-muted-foreground">No activity yet.</div>}
        </div>
      </Card>
    </div>
  );
}