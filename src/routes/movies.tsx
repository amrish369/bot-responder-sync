import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { listPublicMovies, type PublicMovie } from "@/lib/public-movies.functions";

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

type Search = { q?: string; page?: number };

export const Route = createFileRoute("/movies")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? "", page: search.page ?? 1 }),
  loader: ({ deps }) => listPublicMovies({ data: deps }),
  head: () => ({
    meta: [
      { title: "Movie Library — Download Links | CineRadar" },
      {
        name: "description",
        content:
          "Browse the full CineRadar movie library. Every title has a shareable download link that delivers the file instantly on Telegram.",
      },
      { property: "og:title", content: "Movie Library — Download Links | CineRadar" },
      {
        property: "og:description",
        content: "Search hundreds of movies and grab an instant Telegram download link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoviesPage,
});

function MoviesPage() {
  const { movies, total, page, perPage } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/movies" });
  const [q, setQ] = useState(search.q ?? "");
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Movie Library</h1>
          <p className="text-muted-foreground">
            {total} files available — kisi bhi movie ka link share karo, download Telegram par instant.
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: { q: q || undefined, page: undefined } });
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movie title…"
            className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm"
            aria-label="Search movies"
          />
          <button className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Search
          </button>
        </form>

        {movies.length === 0 ? (
          <p className="text-muted-foreground">Koi movie nahi mili.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {movies.map((m: PublicMovie) => (
              <li key={m.id}>
                <Link
                  to="/m/$id"
                  params={{ id: String(m.id) }}
                  className="block overflow-hidden rounded-lg border border-border transition hover:border-primary"
                >
                  {m.poster_url ? (
                    <img
                      src={m.poster_url}
                      alt={`${m.title} poster`}
                      className="aspect-[2/3] w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                      No poster
                    </div>
                  )}
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[m.year, m.quality, fmtSize(m.file_size)].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-center gap-4 pt-4">
            <Link
              to="/movies"
              search={{ q: search.q, page: page > 2 ? page - 1 : undefined }}
              disabled={page <= 1}
              className="rounded-md border border-border px-4 py-2 text-sm data-[disabled]:opacity-40"
            >
              Previous
            </Link>
            <span className="text-sm text-muted-foreground">
              Page {page} / {pages}
            </span>
            <Link
              to="/movies"
              search={{ q: search.q, page: page + 1 }}
              disabled={page >= pages}
              className="rounded-md border border-border px-4 py-2 text-sm data-[disabled]:opacity-40"
            >
              Next
            </Link>
          </nav>
        )}
      </main>
    </div>
  );
}