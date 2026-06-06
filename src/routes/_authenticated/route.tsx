import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { checkIsAdmin } from "@/lib/admin/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Menu, X, LayoutDashboard, Film, Users, Send, Bot as BotIcon, LogOut, Settings, HardDrive, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const navigate = useNavigate();
  const check = useServerFn(checkIsAdmin);
  const [ok, setOk] = useState<null | boolean>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    check().then((r) => setOk(r.ok)).catch(() => setOk(false));
  }, [check]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (ok === null) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">Your email is not on the admin allowlist.</p>
          <Button onClick={signOut} variant="outline">Sign out</Button>
        </div>
      </div>
    );
  }

  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/movies", label: "Movies", icon: Film },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/requests", label: "Requests", icon: Inbox },
    { to: "/admin/broadcast", label: "Broadcast", icon: Send },
    { to: "/admin/bots", label: "Bots", icon: BotIcon },
    { to: "/admin/storage", label: "Storage", icon: HardDrive },
    { to: "/admin/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile topbar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between border-b bg-card px-4 h-14">
        <div className="font-semibold">CineRadar Admin</div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 left-0 z-20 h-screen w-64 border-r bg-card transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} pt-14 md:pt-0`}>
        <div className="p-4 hidden md:block">
          <div className="font-bold text-lg">CineRadar</div>
          <div className="text-xs text-muted-foreground">Super Admin</div>
        </div>
        <nav className="px-3 space-y-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: n.to === "/admin" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
              activeProps={{ className: "active" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 inset-x-0 p-4 border-t">
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}