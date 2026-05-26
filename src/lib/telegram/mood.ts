export const MOOD_MAP: Record<
  string,
  { label: string; emojis: string[]; keywords: string[] }
> = {
  happy:    { label: "😄 Happy",    emojis: ["😄","😁","😊","🥳","😃","🤩","😀"], keywords: ["comedy","feel good","fun","musical","animation","family"] },
  sad:      { label: "😢 Sad",      emojis: ["😢","😭","💔","🥺","😞","😔"],       keywords: ["drama","emotional","tragedy","loss","heartbreak"] },
  romantic: { label: "❤️ Romantic", emojis: ["❤️","🥰","😍","💕","💑","💘","💞"], keywords: ["romance","love","romantic","relationship","couple"] },
  scary:    { label: "😱 Scary",    emojis: ["😱","👻","🎃","😨","🕷️","🧟","💀"], keywords: ["horror","thriller","scary","suspense","ghost","zombie"] },
  funny:    { label: "😂 Funny",    emojis: ["😂","🤣","😆","😝","🤪","😜"],       keywords: ["comedy","funny","laugh","spoof","parody"] },
  action:   { label: "💥 Action",   emojis: ["💥","🔥","⚡","🥊","🏎️","💣","🤜"], keywords: ["action","fight","war","adventure","superhero"] },
  chill:    { label: "😌 Chill",    emojis: ["😌","🧘","☕","🌙","🛋️","😴"],       keywords: ["slice of life","light","mild","gentle","calm"] },
  mystery:  { label: "🔍 Mystery",  emojis: ["🔍","🕵️","🤫","🧐","❓","🔎"],       keywords: ["mystery","detective","crime","whodunit","investigation"] },
};

const EMOJI_TO_MOOD: Record<string, string> = {};
for (const [mood, data] of Object.entries(MOOD_MAP)) {
  for (const e of data.emojis) EMOJI_TO_MOOD[e] = mood;
}

export function detectMood(text: string | undefined | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  for (const mood of Object.keys(MOOD_MAP)) {
    if (
      lower === mood ||
      lower.startsWith(mood + " ") ||
      lower.endsWith(" " + mood) ||
      lower.includes(mood + " movie") ||
      lower.includes(mood + " film")
    ) {
      return mood;
    }
  }
  for (const char of [...text]) {
    if (EMOJI_TO_MOOD[char]) return EMOJI_TO_MOOD[char];
  }
  return null;
}