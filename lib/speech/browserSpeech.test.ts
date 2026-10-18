import { describe, expect, it } from "vitest";
import { pickVoice, recognitionLang, transcriptOf } from "./browserSpeech";

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
