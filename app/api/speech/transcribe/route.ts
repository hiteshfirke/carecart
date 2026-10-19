import { NextResponse } from "next/server";
import { currentHousehold } from "@/lib/demo";
import { speechAllowed, transcribeAudio, voiceConfig, VoiceError } from "@/lib/voice";

const MAX_BYTES = 4_000_000; // about 4 minutes of compressed speech; Vercel caps request bodies at 4.5 MB

// Speech recognition for browsers without their own (Firefox): the browser records, Whisper transcribes.
export async function POST(req: Request) {
  if (!(await currentHousehold())) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  if (!voiceConfig() || !(await speechAllowed())) return NextResponse.json({ error: "voice_off" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_BYTES || !audio.type.startsWith("audio/")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const name = audio.type.includes("mp4") ? "speech.mp4" : audio.type.includes("ogg") ? "speech.ogg" : "speech.webm";
    return NextResponse.json({ text: await transcribeAudio(audio, name) });
  } catch (err) {
    console.error("transcription failed", err instanceof VoiceError ? err.status : null, (err as Error).message);
    return NextResponse.json({ error: "voice_failed" }, { status: 502 });
  }
}
