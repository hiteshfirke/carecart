"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice, recognitionLang, transcriptOf } from "@/lib/speech/browserSpeech";

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

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(opts: { onText: (text: string) => void; rate: number; muted: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<"mic-blocked" | "no-speech" | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const onText = useRef(opts.onText);

  useEffect(() => {
    onText.current = opts.onText;
  }, [opts.onText]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after mount
    setSupported(recognitionCtor() !== null);
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

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (opts.muted || typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
      return new Promise((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice.current) utterance.voice = voice.current;
        utterance.lang = voice.current?.lang ?? "en-US";
        utterance.rate = opts.rate;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        // Browsers may block speech without a user gesture; never wait forever.
        setTimeout(resolve, Math.min(20_000, 2_000 + text.length * 90));
        window.speechSynthesis.speak(utterance);
      });
    },
    [opts.muted, opts.rate],
  );

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const r = new Ctor();
    r.lang = recognitionLang(navigator.language);
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;

    let text = "";
    let failed = false;
    let silence: ReturnType<typeof setTimeout> | undefined;
    const cap = setTimeout(() => r.stop(), MAX_LISTEN_MS);
    r.onresult = (e) => {
      text = transcriptOf(e.results);
      setHeard(text);
      clearTimeout(silence);
      silence = setTimeout(() => r.stop(), SILENCE_MS);
    };
    r.onerror = (e) => {
      failed = true;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "mic-blocked" : "no-speech");
    };
    // Runs after a pause, a tap on stop, an error or the time cap: send whatever was heard.
    r.onend = () => {
      clearTimeout(silence);
      clearTimeout(cap);
      setListening(false);
      setHeard("");
      if (text) onText.current(text);
      else if (!failed) setError("no-speech");
    };
    recognition.current = r;
    setError(null);
    setHeard("");
    setListening(true);
    try {
      r.start();
    } catch {
      clearTimeout(cap);
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);
  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, heard, error, speak, start, stop, toggle };
}
