import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { addAdminByEmail, listAdmins, removeAdminByEmail } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Shield, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/admins")({ component: AdminsPage });

function AdminsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdmins);
  const add = useServerFn(addAdminByEmail);
  const remove = useServerFn(removeAdminByEmail);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "admins"], queryFn: () => list() });
  const rows: any[] = data?.rows ?? [];
  const [email, setEmail] = useState("");

  const onAdd = async () => {
    const value = email.trim();
    if (!value) {
      toast.error("Email required");
      return;
    }
    try {
      const res = await add({ data: { email: value } });
      if ((res as any)?.added === false) {
        toast.info(`Already admin: ${value.toLowerCase()}`);
      } else {
        toast.success(`Added ${value.toLowerCase()}`);
      }
      setEmail("");
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onRemove = async (targetEmail: string) => {
    if (!confirm(`Remove admin access for ${targetEmail}?`)) return;
    try {
      await remove({ data: { email: targetEmail } });
      toast.success(`Removed ${targetEmail}`);
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Admins</h1>
          <p className="text-sm text-muted-foreground">Manage who can access the admin dashboard.</p>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Add admin</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-w-md"
          />
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add admin
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Email</th>
              <th className="p-2">Added</th>
              <th className="p-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No admins added yet.</td></tr>}
            {rows.map((admin: any) => (
              <tr key={admin.id} className="border-t">
                <td className="p-2 font-medium">{admin.email}</td>
                <td className="p-2 text-muted-foreground text-xs">
                  {new Date(admin.created_at).toLocaleString()}
                </td>
                <td className="p-2 text-right">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={rows.length <= 1}
                    onClick={() => onRemove(admin.email)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
