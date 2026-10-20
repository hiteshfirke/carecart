import { NextResponse } from "next/server";
import { z } from "zod";
import { currentHousehold } from "@/lib/demo";
import { SPEECH_CHUNK_MAX } from "@/lib/speech/browserSpeech";
import { speechAllowed, synthesizeSpeech, voiceConfig, VoiceError, voiceUnavailable } from "@/lib/voice";

const Body = z.object({ text: z.string().trim().min(1).max(SPEECH_CHUNK_MAX) });

// One piece of a reply (the browser splits replies). 503 tells the browser to use its own voice.
export async function POST(req: Request) {
  if (!(await currentHousehold())) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  if (!voiceConfig() || !(await speechAllowed())) return NextResponse.json({ error: "voice_off" }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const audio = await synthesizeSpeech(parsed.data.text, fetch, req.signal);
    return new Response(audio, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("speech synthesis failed", err instanceof VoiceError ? err.status : null, (err as Error).message);
    if (voiceUnavailable(err)) return NextResponse.json({ error: "voice_off" }, { status: 503 });
    return NextResponse.json({ error: "voice_failed" }, { status: 502 });
  }
}
