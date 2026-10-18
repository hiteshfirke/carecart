import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech, transcribeAudio, voiceConfig, VoiceError } from "./voice";

beforeEach(() => {
  vi.stubEnv("VOICE_API_KEY", "voice-key");
  vi.stubEnv("VOICE_BASE_URL", "");
  vi.stubEnv("AI_BASE_URL", "");
  vi.stubEnv("AI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("voiceConfig", () => {
  it("uses Groq with Orpheus 'hannah' and Whisper by default", () => {
    expect(voiceConfig()).toEqual({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "voice-key",
      ttsModel: "canopylabs/orpheus-v1-english",
      voice: "hannah",
      sttModel: "whisper-large-v3-turbo",
    });
  });

  it("reuses the AI key when the AI already runs on Groq", () => {
    vi.stubEnv("VOICE_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "https://api.groq.com/openai/v1");
    vi.stubEnv("AI_API_KEY", "gsk_ai");
    expect(voiceConfig()?.apiKey).toBe("gsk_ai");
  });

  it("is off (null) without any usable key, so the browser voice is used", () => {
    vi.stubEnv("VOICE_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "other");
    expect(voiceConfig()).toBeNull();
  });
});

describe("synthesizeSpeech", () => {
  it("asks for WAV speech in the configured voice and returns the bytes", async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "Content-Type": "audio/wav" } }));
    const audio = await synthesizeSpeech("Hello Rose.", f as unknown as typeof fetch);
    expect(new Uint8Array(audio)).toEqual(new Uint8Array([82, 73, 70, 70]));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/speech");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer voice-key");
    expect(JSON.parse(String(init.body))).toEqual({ model: "canopylabs/orpheus-v1-english", voice: "hannah", input: "Hello Rose.", response_format: "wav" });
  });

  it("throws VoiceError with the status when Groq refuses", async () => {
    const f = vi.fn(async () => new Response("limit", { status: 429 }));
    await expect(synthesizeSpeech("Hi", f as unknown as typeof fetch)).rejects.toMatchObject({ status: 429 });
    await expect(synthesizeSpeech("Hi", f as unknown as typeof fetch)).rejects.toBeInstanceOf(VoiceError);
  });
});

describe("transcribeAudio", () => {
  it("sends the recording to Whisper in English and returns the text", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ text: " I need reading glasses. " }), { status: 200 }));
    const text = await transcribeAudio(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "speech.webm", f as unknown as typeof fetch);
    expect(text).toBe("I need reading glasses.");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("en");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});
