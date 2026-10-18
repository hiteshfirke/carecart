// Pure helpers for the browser's Web Speech API, kept out of the hook so they can be unit-tested.

type VoiceLike = { name: string; lang: string };

// macOS and Chrome ship joke and robotic voices; an older listener should never get one of these.
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy)\b/i;
const NATURAL = /(natural|neural|premium|enhanced|online)/i;
const PREFERRED = /(google us english|samantha|\bava\b|aria|jenny|allison|zoe|evan|nathan|serena|karen|daniel|moira|tessa)/i;

const normalizeLang = (lang: string) => lang.replace("_", "-").toLowerCase();

export function pickVoice<V extends VoiceLike>(voices: V[], lang = "en-US"): V | null {
  const english = voices.filter((voice) => normalizeLang(voice.lang).startsWith("en") && !NOVELTY.test(voice.name));
  const score = (voice: V) =>
    (normalizeLang(voice.lang) === lang.toLowerCase() ? 4 : 0) + (NATURAL.test(voice.name) ? 3 : 0) + (PREFERRED.test(voice.name) ? 2 : 0);
  return english.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function recognitionLang(browserLang: string | undefined): string {
  return browserLang && browserLang.toLowerCase().startsWith("en") ? browserLang : "en-US";
}

export function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  return Array.from(results, (r) => r[0]?.transcript ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Groq's Orpheus voice takes at most 200 characters per request, so replies are spoken in pieces.
export const SPEECH_CHUNK_MAX = 200;

function packWords(sentence: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const word of sentence.split(" ")) {
    if (current && current.length + 1 + word.length > max) {
      parts.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function splitForSpeech(text: string, max = SPEECH_CHUNK_MAX): string[] {
  const clean = text.replace(/[‐‑]/g, "-").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    const pieces = sentence.length > max ? packWords(sentence, max) : [sentence];
    for (const piece of pieces) {
      if (current && current.length + 1 + piece.length > max) {
        chunks.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
