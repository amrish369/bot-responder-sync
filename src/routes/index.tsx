import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-bold">CineRadar AI — Super Admin</h1>
        <p className="text-muted-foreground">Telegram movie bot control panel.</p>
        <a href="/admin" className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Open Admin Panel
        </a>
      </div>
    </div>
  );
}
