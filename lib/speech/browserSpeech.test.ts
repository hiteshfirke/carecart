import { describe, expect, it } from "vitest";
import { pickVoice, recognitionLang, speechTimeoutMs, splitForSpeech, transcriptOf } from "./browserSpeech";

const v = (name: string, lang = "en-US") => ({ name, lang });

describe("pickVoice", () => {
  it("prefers a natural-sounding US English voice", () => {
    const voices = [v("Fred"), v("Albert"), v("Samantha"), v("Google US English"), v("Microsoft Aria Online (Natural) - English (United States)")];
    expect(pickVoice(voices)?.name).toBe("Microsoft Aria Online (Natural) - English (United States)");
  });

  it("never picks a novelty or robotic voice, even if it is the only US one", () => {
    expect(pickVoice([v("Zarvox"), v("Bad News"), v("Daniel", "en-GB")])?.name).toBe("Daniel");
  });

  it("accepts underscore language tags and returns null without English voices", () => {
    expect(pickVoice([v("Samantha", "en_US")])?.name).toBe("Samantha");
    expect(pickVoice([v("Amélie", "fr-CA")])).toBeNull();
  });
});

describe("recognitionLang", () => {
  it("listens in the browser's English variant, so accents are understood better", () => {
    expect(recognitionLang("en-IN")).toBe("en-IN");
    expect(recognitionLang("en-GB")).toBe("en-GB");
  });

  it("falls back to US English for other languages or none", () => {
    expect(recognitionLang("hi-IN")).toBe("en-US");
    expect(recognitionLang(undefined)).toBe("en-US");
  });
});

describe("transcriptOf", () => {
  it("joins every phrase heard so far, so a pause doesn't cut the sentence", () => {
    const results = [[{ transcript: "I am looking for" }], [{ transcript: " reading  glasses " }]];
    expect(transcriptOf(results)).toBe("I am looking for reading glasses");
  });

  it("is empty when nothing was heard", () => {
    expect(transcriptOf([])).toBe("");
  });
});

describe("splitForSpeech", () => {
  it("keeps a short reply in one piece", () => {
    expect(splitForSpeech("Okay. What else do you need?")).toEqual(["Okay. What else do you need?"]);
  });

  it("packs whole sentences into pieces of at most 200 characters, in order", () => {
    const text =
      "Option one: Large Print Crosswords Book, one dollar and fifty cents, from Dollartree. Option two: Take-Along Large Print Crosswords Puzzle Book, one dollar and fifty cents, from Dollartree. Option three: Brain Games Crossword Puzzles, twelve dollars and ten cents, from Target. Which one would you like?";
    const parts = splitForSpeech(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join(" ")).toBe(text);
    expect(parts[0].startsWith("Option one")).toBe(true);
  });

  it("splits one very long sentence at spaces", () => {
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const parts = splitForSpeech(text);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join(" ")).toBe(text);
  });

  it("turns unusual hyphens into plain ones and drops empty text", () => {
    expect(splitForSpeech("fifty\u2011nine dollars")).toEqual(["fifty-nine dollars"]);
    expect(splitForSpeech("   ")).toEqual([]);
  });
});

describe("speechTimeoutMs", () => {
  it("gives slower speech proportionally more time before giving up", () => {
    const text = "x".repeat(100);
    expect(speechTimeoutMs(text, 0.6)).toBeGreaterThan(speechTimeoutMs(text, 0.9));
    // About 8 characters a second at rate 0.6: 100 characters must not be cut off before ~13 s.
    expect(speechTimeoutMs(text, 0.6)).toBeGreaterThanOrEqual(15_000);
  });

  it("never waits forever", () => {
    expect(speechTimeoutMs("x".repeat(5000), 0.6)).toBeLessThanOrEqual(60_000);
  });
});
