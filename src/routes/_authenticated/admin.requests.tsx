import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRequests, fulfillRequestAdmin } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/requests")({ component: RequestsPage });

function RequestsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listRequests);
  const fulfill = useServerFn(fulfillRequestAdmin);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "requests"], queryFn: () => list() });
  const rows: any[] = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold">Requests <span className="text-sm font-normal text-muted-foreground">({rows.length})</span></h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-2">ID</th><th className="p-2">User</th><th className="p-2">Title</th><th className="p-2">Status</th><th className="p-2">When</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No requests.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono text-xs">{r.id}</td>
                <td className="p-2">{r.username ? `@${r.username}` : r.user_id}</td>
                <td className="p-2">{r.title}</td>
                <td className="p-2">
                  <span className={`text-xs rounded px-2 py-0.5 ${r.status === "fulfilled" ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>{r.status}</span>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2 text-right">
                  {r.status !== "fulfilled" && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      try { await fulfill({ data: { id: r.id } }); toast.success("Marked fulfilled"); qc.invalidateQueries({ queryKey: ["admin", "requests"] }); }
                      catch (e) { toast.error((e as Error).message); }
                    }}><Check className="h-4 w-4 mr-1" />Mark done</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}