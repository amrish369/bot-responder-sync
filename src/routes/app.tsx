import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { miniAppFeed, miniAppMovie, type MiniMovie } from "@/lib/miniapp.functions";

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

type Search = { q?: string; quality?: string; page?: number };

const QUALITIES = ["All", "480p", "720p", "1080p", "4K"];

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 80) : undefined,
    quality:
      typeof search.quality === "string" && search.quality ? search.quality.slice(0, 10) : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q ?? "",
    quality: search.quality ?? "",
    page: search.page ?? 1,
  }),
  loader: ({ deps }) => miniAppFeed({ data: deps }),
  head: () => ({
    meta: [
      { title: "CineRadar Movie App — Browse & Download on Telegram" },
      {
        name: "description",
        content:
          "Browse posters, filter by quality and get any movie delivered straight to your Telegram chat.",
      },
      { property: "og:title", content: "CineRadar Movie App" },
      {
        property: "og:description",
        content: "Poster-first movie catalog with instant Telegram delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MiniApp,
});

function useTelegram() {
  const [tg, setTg] = useState<any>(null);
  useEffect(() => {
    const boot = () => {
      const w = (window as any).Telegram?.WebApp;
      if (!w) return;
      try {
        w.ready();
        w.expand();
        w.setHeaderColor?.("#0b0b0f");
        w.setBackgroundColor?.("#0b0b0f");
      } catch {
        /* older clients */
      }
      setTg(w);
    };
    if ((window as any).Telegram?.WebApp) {
      boot();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.onload = boot;
    document.head.appendChild(s);
  }, []);
  return tg;
}

function MiniApp() {
  const { movies, featured, total, page, perPage, botUsername } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app" });
  const tg = useTelegram();
  const [q, setQ] = useState(search.q ?? "");
  const [openId, setOpenId] = useState<number | null>(null);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const activeQuality = search.quality ?? "All";

  useEffect(() => {
    if (!tg?.BackButton) return;
    if (openId) {
      tg.BackButton.show();
      const cb = () => setOpenId(null);
      tg.BackButton.onClick(cb);
      return () => {
        tg.BackButton.offClick(cb);
        tg.BackButton.hide();
      };
    }
    tg.BackButton.hide();
  }, [tg, openId]);

  const tap = () => tg?.HapticFeedback?.impactOccurred?.("light");

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white pb-10">
      <header className="sticky top-0 z-20 bg-[#0b0b0f]/95 backdrop-blur px-4 pt-4 pb-3 space-y-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">🎬 CineRadar</h1>
          <span className="text-xs text-white/50">{total} files</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            tap();
            navigate({ search: (s) => ({ ...s, q: q || undefined, page: undefined }) });
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Movie ka naam search karein..."
            className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
          />
        </form>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {QUALITIES.map((qa) => {
            const active = activeQuality === qa;
            return (
              <button
                key={qa}
                onClick={() => {
                  tap();
                  navigate({
                    search: (s) => ({
                      ...s,
                      quality: qa === "All" ? undefined : qa,
                      page: undefined,
                    }),
                  });
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  active ? "bg-white text-black" : "bg-white/10 text-white/70"
                }`}
              >
                {qa}
              </button>
            );
          })}
        </div>
      </header>

      {featured.length > 0 && (
        <section className="px-4 pt-4">
          <h2 className="mb-2 text-sm font-semibold text-white/70">Trending Now</h2>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {featured.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  tap();
                  setOpenId(m.id);
                }}
                className="relative h-40 w-72 shrink-0 overflow-hidden rounded-2xl bg-white/5 text-left"
              >
                {m.backdrop_url && (
                  <img
                    src={m.backdrop_url}
                    alt={m.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                <div className="absolute bottom-0 p-3">
                  <p className="line-clamp-1 text-sm font-semibold">{m.title}</p>
                  <p className="text-[11px] text-white/60">
                    {[m.year, m.language, m.quality].filter(Boolean).join(" • ")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 pt-5">
        <h2 className="mb-3 text-sm font-semibold text-white/70">
          {search.q ? `Results for "${search.q}"` : "Latest Uploads"}
        </h2>
        {movies.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/50">Koi movie nahi mili.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {movies.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  tap();
                  setOpenId(m.id);
                }}
                className="text-left"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5">
                  {m.poster_url ? (
                    <img
                      src={m.poster_url}
                      alt={m.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">🎞️</div>
                  )}
                  {m.quality && (
                    <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold">
                      {m.quality}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-tight">{m.title}</p>
                <p className="text-[10px] text-white/45">
                  {[m.year, fmtSize(m.file_size)].filter(Boolean).join(" • ")}
                </p>
              </button>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => {
                tap();
                navigate({ search: (s) => ({ ...s, page: page - 1 > 1 ? page - 1 : undefined }) });
              }}
              className="rounded-lg bg-white/10 px-4 py-2 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-white/60">
              {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => {
                tap();
                navigate({ search: (s) => ({ ...s, page: page + 1 }) });
              }}
              className="rounded-lg bg-white/10 px-4 py-2 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </section>

      {openId !== null && (
        <MovieSheet
          id={openId}
          fallbackBot={botUsername}
          tg={tg}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function MovieSheet({
  id,
  fallbackBot,
  tg,
  onClose,
}: {
  id: number;
  fallbackBot: string;
  tg: any;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    movie: MiniMovie | null;
    versions: MiniMovie[];
    botUsername: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    miniAppMovie({ data: { id } })
      .then((res) => {
        if (alive) setData(res as any);
      })
      .catch(() => alive && setData({ movie: null, versions: [], botUsername: fallbackBot }));
    return () => {
      alive = false;
    };
  }, [id, fallbackBot]);

  const bot = data?.botUsername || fallbackBot;

  const deliver = (movieId: number) => {
    tg?.HapticFeedback?.notificationOccurred?.("success");
    const link = `https://t.me/${bot}?start=dl_${movieId}`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(link);
      setTimeout(() => tg.close?.(), 400);
    } else {
      window.location.href = link;
    }
  };

  const movie = data?.movie ?? null;
  const all = movie ? [movie, ...(data?.versions ?? [])] : [];

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[#14141b] pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex justify-center bg-[#14141b] py-3">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        {!data ? (
          <p className="py-20 text-center text-sm text-white/50">Loading…</p>
        ) : !movie ? (
          <p className="py-20 text-center text-sm text-white/50">Movie nahi mili.</p>
        ) : (
          <>
            {movie.backdrop_url && (
              <div className="relative h-44 w-full overflow-hidden">
                <img src={movie.backdrop_url} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14141b] to-transparent" />
              </div>
            )}
            <div className="px-5 pt-4">
              <h3 className="text-xl font-bold leading-tight">{movie.title}</h3>
              <p className="mt-1 text-xs text-white/55">
                {[movie.year, movie.language, movie.genres, movie.runtime ? `${movie.runtime} min` : null]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
              {movie.overview && (
                <p className="mt-3 text-sm leading-relaxed text-white/70">{movie.overview}</p>
              )}

              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/50">
                Available Files
              </h4>
              <div className="mt-2 space-y-2">
                {all.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => deliver(v.id)}
                    className="flex w-full items-center justify-between rounded-xl bg-white/10 px-4 py-3 text-left active:bg-white/20"
                  >
                    <span className="text-sm font-medium">
                      {v.quality || "File"} {v.language ? `• ${v.language}` : ""}
                    </span>
                    <span className="text-xs text-white/60">{fmtSize(v.file_size) || "Get"}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => deliver(movie.id)}
                className="mt-5 w-full rounded-xl bg-white py-3 text-sm font-bold text-black active:opacity-80"
              >
                📥 Telegram Par Bhejein
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
