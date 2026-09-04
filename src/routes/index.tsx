import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CineRadar AI — Telegram Movie Bot Admin" },
      { name: "description", content: "Control panel for the CineRadar AI Telegram movie bot: catalog, users, requests, broadcasts and bots." },
      { property: "og:title", content: "CineRadar AI — Telegram Movie Bot Admin" },
      { property: "og:description", content: "Control panel for the CineRadar AI Telegram movie bot: catalog, users, requests, broadcasts and bots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
