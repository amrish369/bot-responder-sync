import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMovies, updateMovieAdmin, deleteMovieAdmin, reArchiveMovie } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Pencil, Search, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/movies")({ component: MoviesPage });

function MoviesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMovies);
  const upd = useServerFn(updateMovieAdmin);
  const del = useServerFn(deleteMovieAdmin);
  const rearchive = useServerFn(reArchiveMovie);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "movies", search, offset],
    queryFn: () => list({ data: { search, offset, limit: 50 } }),
  });

  const rows: any[] = data?.rows ?? [];
  const total = data?.total ?? 0;

  const toggleSel = (id: number) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} movies?`)) return;
    await del({ data: { ids: Array.from(selected) } });
    toast.success(`Deleted ${selected.size}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin", "movies"] });
  };

  const save = async () => {
    if (!editing) return;
    await upd({ data: { id: editing.id, patch: {
      title: editing.title, language: editing.language, quality: editing.quality,
      year: editing.year ? Number(editing.year) : null, type: editing.type,
    } } });
    toast.success("Saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin", "movies"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">Movies <span className="text-sm font-normal text-muted-foreground">({total})</span></h1>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={bulkDelete}>
            <Trash2 className="h-4 w-4 mr-2" />Delete {selected.size}
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search title…" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 w-8"></th>
              <th className="p-2">ID</th>
              <th className="p-2">Title</th>
              <th className="p-2 hidden md:table-cell">Quality</th>
              <th className="p-2 hidden md:table-cell">Lang</th>
              <th className="p-2 hidden md:table-cell">Year</th>
              <th className="p-2">Storage</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No movies.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2"><Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggleSel(m.id)} /></td>
                <td className="p-2 font-mono text-xs">{m.id}</td>
                <td className="p-2 max-w-[200px] truncate">{m.title}</td>
                <td className="p-2 hidden md:table-cell">{m.quality ?? "—"}</td>
                <td className="p-2 hidden md:table-cell">{m.language ?? "—"}</td>
                <td className="p-2 hidden md:table-cell">{m.year ?? "—"}</td>
                <td className="p-2">
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs ${m.storage_message_id ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
                    {m.storage_message_id ? "archived" : "legacy"}
                  </span>
                </td>
                <td className="p-2 text-right">
                  {!m.storage_message_id && (
                    <Button variant="ghost" size="icon" title="Re-archive into storage" onClick={async () => {
                      try { await rearchive({ data: { id: m.id } }); toast.success(`#${m.id} archived`); qc.invalidateQueries({ queryKey: ["admin", "movies"] }); }
                      catch (e) { toast.error((e as Error).message); }
                    }}><RefreshCw className="h-4 w-4" /></Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ ...m })}><Pencil className="h-4 w-4" /></Button>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit movie</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quality</Label><Input value={editing.quality ?? ""} onChange={(e) => setEditing({ ...editing, quality: e.target.value })} /></div>
                <div><Label>Language</Label><Input value={editing.language ?? ""} onChange={(e) => setEditing({ ...editing, language: e.target.value })} /></div>
                <div><Label>Year</Label><Input type="number" value={editing.year ?? ""} onChange={(e) => setEditing({ ...editing, year: e.target.value })} /></div>
                <div><Label>Type</Label><Input value={editing.type ?? ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}