"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice, recognitionLang, speechTimeoutMs, splitForSpeech, transcriptOf } from "@/lib/speech/browserSpeech";

type RecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

// Older speakers pause mid-sentence; only stop after this much silence (or when they tap stop).
const SILENCE_MS = 2000;
const MAX_LISTEN_MS = 20_000;
// Recording path: the microphone level (0–1) that counts as speech.
const SPEECH_LEVEL = 0.02;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Phones: Chrome on Android repeats words in continuous recognition ("I want I want a pair…"),
// so phones record and let the server transcribe, like browsers without recognition.
function isPhone(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function canRecord(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

// The server's natural voice (Groq Orpheus). Once it answers 503 it is off for this page.
let serverVoice: "unknown" | "on" | "off" = "unknown";
// The server's transcription (Groq Whisper). Once it answers 503, phones fall back to their own recognizer.
let serverListening: "unknown" | "off" = "unknown";

async function fetchSpeech(text: string, signal: AbortSignal): Promise<Blob | null> {
  if (serverVoice === "off") return null;
  try {
    const res = await fetch("/api/speech/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal });
    if (res.status === 503) serverVoice = "off";
    if (!res.ok) return null;
    serverVoice = "on";
    return await res.blob();
  } catch {
    return null;
  }
}

export function useSpeech(opts: { onText: (text: string) => void; rate: number; muted: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<"mic-blocked" | "no-speech" | null>(null);
  const active = useRef<{ stop(): void } | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0); // bumps on every new speak() or listen, so stale audio stops
  const pending = useRef<AbortController | null>(null); // the pieces being fetched for the current speech
  const onText = useRef(opts.onText);

  useEffect(() => {
    onText.current = opts.onText;
  }, [opts.onText]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after mount
    setSupported(recognitionCtor() !== null || canRecord());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Chrome loads its voice list asynchronously.
    const load = () => {
      voice.current = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const silence = useCallback(() => {
    generation.current++;
    pending.current?.abort(); // don't keep fetching pieces nobody will hear
    pending.current = null;
    audio.current?.pause();
    audio.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speakWithBrowser = useCallback(
    (text: string, rate: number): Promise<void> => {
      if (!("speechSynthesis" in window)) return Promise.resolve();
      return new Promise((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice.current) utterance.voice = voice.current;
        utterance.lang = voice.current?.lang ?? "en-US";
        utterance.rate = rate;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        // Browsers may block speech without a user gesture; never wait forever.
        setTimeout(resolve, speechTimeoutMs(text, rate));
        window.speechSynthesis.speak(utterance);
      });
    },
    [],
  );

  // Plays one piece; resolves false if the browser refused to play it.
  const play = useCallback(
    (blob: Blob, gen: number, rate: number): Promise<boolean> =>
      new Promise((resolve) => {
        if (gen !== generation.current) return resolve(true);
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
        el.preservesPitch = true;
        audio.current = el;
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(url);
          resolve(ok);
        };
        el.onended = () => done(true);
        el.onpause = () => done(true); // stopped by silence()
        el.onerror = () => done(false);
        setTimeout(() => done(true), 30_000);
        el.play().catch(() => done(false));
      }),
    [],
  );

  // `rate` overrides the setting for this one call, so "slower" is confirmed at the new speed.
  const speak = useCallback(
    async (text: string, rate: number = opts.rate): Promise<void> => {
      if (opts.muted || typeof window === "undefined") return;
      silence();
      const gen = generation.current;
      const controller = new AbortController();
      pending.current = controller;
      const pieces = splitForSpeech(text);
      let next = pieces.length ? fetchSpeech(pieces[0], controller.signal) : null;
      for (let i = 0; i < pieces.length; i++) {
        const blob = await next;
        if (gen !== generation.current) return;
        next = i + 1 < pieces.length ? fetchSpeech(pieces[i + 1], controller.signal) : null; // fetch ahead while this piece plays
        if (!blob || !(await play(blob, gen, rate))) {
          // The natural voice is unavailable: say the rest with the browser's voice.
          controller.abort(); // the piece being fetched ahead will never play
          if (gen === generation.current) await speakWithBrowser(pieces.slice(i).join(" "), rate);
          return;
        }
      }
    },
    [opts.muted, opts.rate, silence, play, speakWithBrowser],
  );

  const listenWithRecognition = useCallback((Ctor: RecognitionCtor) => {
    const r = new Ctor();
    r.lang = recognitionLang(navigator.language);
    r.interimResults = true;
    // Continuous mode keeps listening through pauses, but Android repeats words in it.
    r.continuous = !/Android/i.test(navigator.userAgent);
    r.maxAlternatives = 1;

    let text = "";
    let failed = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const cap = setTimeout(() => r.stop(), MAX_LISTEN_MS);
    r.onresult = (e) => {
      text = transcriptOf(e.results);
      setHeard(text);
      clearTimeout(quiet);
      quiet = setTimeout(() => r.stop(), SILENCE_MS);
    };
    r.onerror = (e) => {
      failed = true;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "mic-blocked" : "no-speech");
    };
    // Runs after a pause, a tap on stop, an error or the time cap: send whatever was heard.
    r.onend = () => {
      clearTimeout(quiet);
      clearTimeout(cap);
      active.current = null;
      setListening(false);
      setHeard("");
      if (text) onText.current(text);
      else if (!failed) setError("no-speech");
    };
    active.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      clearTimeout(cap);
      setListening(false);
    }
  }, []);

  // For browsers without speech recognition: record, stop after a pause, and let the server transcribe.
  // `context` is created during the tap: Safari on iPhone keeps an AudioContext made later suspended.
  const listenWithRecorder = useCallback(async (context: AudioContext) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      void context.close();
      setError("mic-blocked");
      return;
    }
    const recorder = new MediaRecorder(stream);
    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const started = Date.now();
    let spoke = false;
    let quietSince = Date.now();
    const meter = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      if (Math.sqrt(sum / samples.length) > SPEECH_LEVEL) {
        spoke = true;
        quietSince = Date.now();
      }
      if ((spoke && Date.now() - quietSince > SILENCE_MS) || Date.now() - started > MAX_LISTEN_MS) recorder.stop();
    }, 100);

    recorder.onstop = async () => {
      clearInterval(meter);
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
      active.current = null;
      setListening(false);
      // Whisper invents words like "Thank you." from silence, so only send real speech.
      if (!spoke || parts.length === 0) return setError("no-speech");
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", new Blob(parts, { type: recorder.mimeType || "audio/webm" }), "speech");
        const res = await fetch("/api/speech/transcribe", { method: "POST", body: form });
        if (res.status === 503) {
          serverListening = "off"; // next tap uses the browser's own recognizer, if it has one
          setSupported(recognitionCtor() !== null);
        }
        const text = res.ok ? ((await res.json()) as { text?: string }).text?.trim() : "";
        if (text) onText.current(text);
        else setError("no-speech");
      } catch {
        setError("no-speech");
      } finally {
        setTranscribing(false);
      }
    };
    active.current = recorder;
    setListening(true);
    recorder.start(250);
  }, []);

  const start = useCallback(() => {
    silence();
    setError(null);
    setHeard("");
    const Ctor = recognitionCtor();
    const record = canRecord() && serverListening !== "off" && (!Ctor || isPhone());
    if (record) {
      const context = new AudioContext(); // inside the tap, so iPhone Safari lets it run
      void context.resume?.();
      void listenWithRecorder(context);
    }
    else if (Ctor) listenWithRecognition(Ctor);
  }, [silence, listenWithRecognition, listenWithRecorder]);

  const stop = useCallback(() => active.current?.stop(), []);
  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, transcribing, heard, error, speak, start, stop, toggle };
}
