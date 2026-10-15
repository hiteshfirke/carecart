"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(opts: { onText: (text: string) => void; rate: number; muted: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<"mic-blocked" | "no-speech" | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onText = useRef(opts.onText);

  useEffect(() => {
    onText.current = opts.onText;
  }, [opts.onText]);
  useEffect(() => {
    setSupported(recognitionCtor() !== null);
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (opts.muted || typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
      return new Promise((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
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
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      if (text) onText.current(text);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "mic-blocked" : "no-speech");
    r.onend = () => setListening(false);
    recognition.current = r;
    setError(null);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);
  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, error, speak, start, stop, toggle };
}
