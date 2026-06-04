import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, setUserBan, exportUsersCSV } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Search, Download, Ban, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({ component: UsersPage });

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const ban = useServerFn(setUserBan);
  const exp = useServerFn(exportUsersCSV);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", search, offset],
    queryFn: () => list({ data: { search, offset, limit: 50 } }),
  });

  const rows: any[] = data?.rows ?? [];
  const total = data?.total ?? 0;

  const toggleBan = async (u: any) => {
    await ban({ data: { telegram_id: u.telegram_id, ban: !u.banned } });
    toast.success(u.banned ? "Unbanned" : "Banned");
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  const download = async () => {
    const r = await exp();
    const blob = new Blob([r.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `users-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${r.count} users`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">Users <span className="text-sm font-normal text-muted-foreground">({total})</span></h1>
        <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search id / username / name…" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Telegram ID</th>
              <th className="p-2">Username</th>
              <th className="p-2 hidden md:table-cell">Name</th>
              <th className="p-2 hidden md:table-cell">Msgs</th>
              <th className="p-2 hidden md:table-cell">Last seen</th>
              <th className="p-2">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No users.</td></tr>}
            {rows.map((u) => (
              <tr key={u.telegram_id} className="border-t">
                <td className="p-2 font-mono text-xs">{u.telegram_id}</td>
                <td className="p-2">{u.username ? `@${u.username}` : "—"}</td>
                <td className="p-2 hidden md:table-cell">{u.first_name ?? "—"}</td>
                <td className="p-2 hidden md:table-cell">{u.message_count}</td>
                <td className="p-2 hidden md:table-cell text-xs text-muted-foreground">{new Date(u.last_seen).toLocaleString()}</td>
                <td className="p-2">
                  {u.banned
                    ? <span className="inline-flex rounded px-2 py-0.5 text-xs bg-red-500/10 text-red-600">banned</span>
                    : <span className="inline-flex rounded px-2 py-0.5 text-xs bg-green-500/10 text-green-600">active</span>}
                </td>
                <td className="p-2 text-right">
                  <Button variant={u.banned ? "outline" : "destructive"} size="sm" onClick={() => toggleBan(u)}>
                    {u.banned ? <><Check className="h-3 w-3 mr-1" />Unban</> : <><Ban className="h-3 w-3 mr-1" />Ban</>}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Prev</Button>
        <span className="text-muted-foreground">{offset + 1}–{Math.min(offset + 50, total)} of {total}</span>
        <Button variant="outline" size="sm" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>Next</Button>
      </div>
    </div>
  );
}