// GroqCloud-powered AI assistant (OpenAI-compatible endpoint).
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

async function groqChat(messages: { role: string; content: string }[], json = false, maxTokens = 400): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[ai] groq error", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const j: any = await res.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("[ai] groq fetch failed", e);
    return null;
  }
}

/** Turns typos / descriptions ("SRK hockey coach movie") into real movie titles. */
export async function aiResolveTitles(query: string): Promise<string[]> {
  const out = await groqChat(
    [
      {
        role: "system",
        content:
          'You identify movies/web-series from user queries (Hindi/Hinglish/English, may have typos or be a description). Reply JSON only: {"titles":["Official English Title", ...]} with up to 3 most likely titles, best first. No years in titles. If not a movie query, return {"titles":[]}.',
      },
      { role: "user", content: query.slice(0, 300) },
    ],
    true,
    600,
  );
  if (!out) return [];
  try {
    const p = JSON.parse(out);
    return Array.isArray(p.titles) ? p.titles.filter((t: any) => typeof t === "string" && t.trim()).slice(0, 3) : [];
  } catch {
    return [];
  }
}

const GUIDE = `You are CineRadar AI, a friendly assistant for a Telegram movie bot. Reply in short Hinglish (max 6 lines), plain text, no markdown.
Bot facts:
- Movie search: just type the movie name in the bot DM or group. Results show buttons per file (quality/size); tap to get the file in DM.
- In groups the file is sent in private chat; user must /start the bot first.
- Must join the main channel https://t.me/cinebotbook and backup group https://t.me/cinebotbackupgroup to get files.
- Files auto-delete after a few minutes — forward/save them quickly.
- Movie not found? Tap the "Request" button; admin uploads it.
- /app opens the Movie App, /random random movie, /new new releases, /upcoming upcoming movies, /help all commands.
- Filters: year, language, quality (480p/720p/1080p).
If the user describes a movie, name the likely movie and tell them to type that name to search.`;

export async function aiGuide(question: string): Promise<string | null> {
  return groqChat(
    [
      { role: "system", content: GUIDE },
      { role: "user", content: question.slice(0, 800) },
    ],
    false,
    900,
  );
}
