import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicMovie, type PublicMovie } from "@/lib/public-movies.functions";

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

export const Route = createFileRoute("/m/$id")({
  loader: ({ params }) => getPublicMovie({ data: { id: Number(params.id) } }),
  head: ({ loaderData }) => {
    const m = loaderData?.movie;
    if (!m) {
      return {
        meta: [
          { title: "Movie not found — CineRadar" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${m.title}${m.year ? ` (${m.year})` : ""} ${m.quality ?? ""} Download — CineRadar`.trim();
    const desc = (
      m.overview ||
      `Download ${m.title}${m.year ? ` (${m.year})` : ""} ${m.language ?? ""} ${m.quality ?? ""} ${fmtSize(m.file_size)} instantly on Telegram.`
    ).slice(0, 155);
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "video.movie" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    const img = m.backdrop_url || m.poster_url;
    if (img && img.startsWith("https://")) {
      meta.push({ property: "og:image", content: img });
      meta.push({ name: "twitter:image", content: img });
    }
    return { meta };
  },
  component: MoviePage,
});

function MoviePage() {
  const { movie, others, botUsername, directDownload } = Route.useLoaderData();

  if (!movie) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">Movie not found</h1>
          <p className="text-muted-foreground">Ye file database se hata di gayi hai.</p>
          <Link to="/movies" className="text-primary underline">Browse all movies</Link>
        </div>
      </div>
    );
  }

  const tgLink = `https://t.me/${botUsername}?start=dl_${movie.id}`;

  return (
    <div className="min-h-screen bg-background">
      {movie.backdrop_url && (
        <div className="relative h-56 w-full overflow-hidden sm:h-72">
          <img
            src={movie.backdrop_url}
            alt={`${movie.title} backdrop`}
            className="h-full w-full object-cover opacity-40"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
      )}

      <main className="mx-auto -mt-16 max-w-3xl px-4 pb-16">
        <div className="flex flex-col gap-6 sm:flex-row">
          {movie.poster_url && (
            <img
              src={movie.poster_url}
              alt={`${movie.title} poster`}
              className="w-36 shrink-0 rounded-lg border border-border shadow-lg sm:w-44"
              loading="lazy"
            />
          )}
          <div className="space-y-3">
            <p className="font-mono text-xs text-primary">ID #{movie.id}</p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {movie.title} {movie.year ? <span className="text-muted-foreground">({movie.year})</span> : null}
            </h1>
            <div className="flex flex-wrap gap-2 text-xs">
              {[movie.language, movie.quality, fmtSize(movie.file_size), movie.genres, movie.runtime ? `${movie.runtime} min` : ""]
                .filter(Boolean)
                .map((chip) => (
                  <span key={String(chip)} className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                    {chip}
                  </span>
                ))}
            </div>
            {movie.overview && <p className="text-sm text-muted-foreground">{movie.overview}</p>}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <a
                href={tgLink}
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Download Now (Telegram)
              </a>
              {directDownload && (
                <a
                  href={`/api/public/dl/${movie.id}`}
                  className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-muted"
                >
                  Direct Download
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              File Telegram par bheji jaati hai — koi size limit nahi, speed full.
            </p>
          </div>
        </div>

        {others.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">Other versions</h2>
            <ul className="space-y-2">
              {others.map((o: PublicMovie) => (
                <li key={o.id}>
                  <Link
                    to="/m/$id"
                    params={{ id: String(o.id) }}
                    className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-mono text-xs text-primary">#{o.id}</span>{" "}
                      {o.title} {o.year ? `(${o.year})` : ""} — {o.language || "N/A"} / {o.quality || "N/A"}
                    </span>
                    <span className="text-muted-foreground">{fmtSize(o.file_size)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10">
          <Link to="/movies" className="text-sm text-primary underline">
            Browse all movies
          </Link>
        </div>
      </main>
    </div>
  );
}