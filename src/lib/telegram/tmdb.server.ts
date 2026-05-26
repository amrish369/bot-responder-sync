import { TMDB_API_KEY, TMDB_BASE, TMDB_IMG } from "./config.server";

const LANG_MAP: Record<string, string> = {
  hi: "Hindi", ta: "Tamil", te: "Telugu", ml: "Malayalam",
  kn: "Kannada", pa: "Punjabi", bn: "Bengali", mr: "Marathi", en: "English",
};

async function tmdbGet<T = any>(endpoint: string, params: Record<string, any> = {}): Promise<T | null> {
  const url = new URL(TMDB_BASE + endpoint);
  url.searchParams.set("api_key", TMDB_API_KEY());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  try {
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch (e) {
    console.error("[TMDB]", endpoint, (e as Error).message);
    return null;
  }
}

export interface TMDBDetail {
  Title: string;
  Year: string;
  Poster: string | null;
  Plot: string;
  imdbRating: string;
  Genre: string;
  Language: string;
  Director: string | null;
  _tmdbId: number;
  _releaseDate: string | null;
}

export async function tmdbSearchByTitle(title: string): Promise<TMDBDetail | null> {
  const data = await tmdbGet<any>("/search/movie", { query: title, language: "en-US", include_adult: false });
  if (!data?.results?.length) return null;
  const top = data.results[0];
  const detail = await tmdbGet<any>(`/movie/${top.id}`, { language: "en-US", append_to_response: "credits" });
  if (!detail) return null;
  const language = LANG_MAP[detail.original_language] || detail.original_language?.toUpperCase() || "N/A";
  const genres = detail.genres?.map((g: any) => g.name).join(", ") || "N/A";
  const director = detail.credits?.crew?.find((c: any) => c.job === "Director")?.name || null;
  const poster = detail.poster_path ? `${TMDB_IMG}${detail.poster_path}` : null;
  return {
    Title: detail.title,
    Year: detail.release_date?.slice(0, 4) || "?",
    Poster: poster,
    Plot: detail.overview || "N/A",
    imdbRating: detail.vote_average ? detail.vote_average.toFixed(1) : "N/A",
    Genre: genres,
    Language: language,
    Director: director,
    _tmdbId: detail.id,
    _releaseDate: detail.release_date || null,
  };
}

export interface TMDBMatch {
  title: string;
  year: string;
  language: string;
  tmdbId: number;
  poster: string | null;
  overview: string;
}

export async function tmdbSearchMultiple(query: string, maxResults = 5): Promise<TMDBMatch[]> {
  const data = await tmdbGet<any>("/search/movie", { query, language: "en-US", include_adult: false, page: 1 });
  if (!data?.results?.length) return [];
  return data.results.slice(0, maxResults).map((m: any) => ({
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : "?",
    language: LANG_MAP[m.original_language] || m.original_language?.toUpperCase() || "N/A",
    tmdbId: m.id,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    overview: m.overview || "",
  }));
}

export interface TMDBIndian {
  Title: string;
  Year: string;
  Poster: string;
  Plot: string;
  imdbRating: string;
  Genre: string;
  Language: string;
  _releaseDate: string;
  _language: string;
  _tmdbId: number;
  _popularity: number;
}

export async function getIndianMoviesByType(type: "new" | "upcoming" = "new", count = 5): Promise<TMDBIndian[]> {
  const today = new Date().toISOString().slice(0, 10);
  const future60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const langCodes = ["hi", "ta", "te", "ml", "kn", "pa", "bn", "mr"];
  const dateFilter = type === "new"
    ? { "primary_release_date.gte": past30, "primary_release_date.lte": today }
    : { "primary_release_date.gte": today, "primary_release_date.lte": future60 };
  const allResults: any[] = [];
  for (const lang of langCodes) {
    const data = await tmdbGet<any>("/discover/movie", {
      with_original_language: lang,
      region: "IN",
      sort_by: "release_date.desc",
      include_adult: false,
      language: "en-US",
      page: 1,
      ...dateFilter,
    });
    if (data?.results?.length) allResults.push(...data.results);
    if (allResults.length >= count * 4) break;
  }
  const seen = new Set<number>();
  const unique = allResults.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  unique.sort((a: any, b: any) => {
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return type === "new"
      ? b.release_date.localeCompare(a.release_date)
      : a.release_date.localeCompare(b.release_date);
  });
  const out: TMDBIndian[] = [];
  for (const m of unique) {
    if (!m.poster_path) continue;
    const releaseDate = m.release_date || "";
    const language = LANG_MAP[m.original_language] || m.original_language?.toUpperCase() || "N/A";
    out.push({
      Title: m.title,
      Year: releaseDate ? releaseDate.slice(0, 4) : "?",
      Poster: `${TMDB_IMG}${m.poster_path}`,
      Plot: m.overview || "N/A",
      imdbRating: m.vote_average ? m.vote_average.toFixed(1) : "N/A",
      Genre: "N/A",
      Language: language,
      _releaseDate: releaseDate,
      _language: language,
      _tmdbId: m.id,
      _popularity: m.popularity,
    });
    if (out.length >= count) break;
  }
  return out;
}