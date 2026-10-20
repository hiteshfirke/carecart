"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpeech } from "@/hooks/useSpeech";
import { parseCommand, type Mode } from "@/lib/speech/commands";
import { caregiverSentMessage, paymentResultMessage } from "@/lib/speech/messages";
import type { OptionView, OrderView } from "@/lib/orders/view";
import { OptionCards } from "./OptionCards";
import { ReadBack } from "./ReadBack";
import { DEFAULT_SETTINGS, SettingsBar, loadSettings, saveSettings, type Settings } from "./SettingsBar";

type Line = { who: "you" | "helper"; text: string };
type Draft = OrderView & { readBack: string };
type Phase = "idle" | "options" | "confirm" | "busy" | "waiting";
type ConfirmResponse = { outcome: string; approveUrl?: string; caregiverName?: string; emailed?: boolean; reasons?: string[]; message?: string };

const HELP = 'Tell me what you need, like "I need reading glasses". You can say "repeat", "slower", "cancel" or "help" at any time.';

export function TalkScreen(props: { seniorName: string; caregiverName: string; returnedOrderId: string | null; paymentResult: string | null }) {
  const { seniorName, caregiverName, returnedOrderId, paymentResult } = props;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lines, setLines] = useState<Line[]>([]);
  const [live, setLive] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [options, setOptions] = useState<OptionView[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dupAck, setDupAck] = useState(false);
  const [watch, setWatch] = useState<{ id: string; last: string } | null>(null);
  const [returned, setReturned] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const payLink = useRef<HTMLAnchorElement>(null);
  const [typed, setTyped] = useState("");
  const lastHelper = useRef("");
  const optionsHeading = useRef<HTMLHeadingElement>(null);
  const readBackHeading = useRef<HTMLHeadingElement>(null);
  const handleTextRef = useRef<(text: string) => void>(() => {});
  const router = useRouter();
  // The last order status Rose was told about. Kept outside the polling effect, which restarts when speech settings change.
  const announced = useRef<{ id: string; status: string } | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after mount
  useEffect(() => setSettings(loadSettings()), []);

  const speech = useSpeech({ onText: (t) => handleTextRef.current(t), rate: settings.rate, muted: settings.screenReader });
  const { speak } = speech;

  const say = useCallback(
    (text: string) => {
      lastHelper.current = text;
      setLive(text);
      setLines((l) => [...l, { who: "helper", text }]);
      return speak(text);
    },
    [speak],
  );

  useEffect(() => {
    if (options) optionsHeading.current?.focus();
  }, [options]);
  useEffect(() => {
    if (draft) readBackHeading.current?.focus();
  }, [draft]);
  useEffect(() => {
    if (payUrl) payLink.current?.focus();
  }, [payUrl]);

  const callAgent = useCallback(
    async (text: string) => {
      setPhase("busy");
      try {
        const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, text }) });
        if (res.status === 401) {
          router.push("/");
          return;
        }
        const data = (await res.json()) as { sessionId: string; reply: string; options: OptionView[] | null; draft: Draft | null };
        setSessionId(data.sessionId);
        if (data.draft) {
          setOptions(null);
          setDupAck(false);
          setDraft(data.draft);
          setPhase("confirm");
          await say(`${data.reply} ${data.draft.readBack}`);
          return;
        }
        if (data.options) {
          setOptions(data.options);
          setPhase("options");
        } else {
          setPhase(draft ? "confirm" : options ? "options" : "idle");
        }
        await say(data.reply);
      } catch {
        setPhase(draft ? "confirm" : "idle");
        await say("Sorry, I couldn't reach the helper. Please try again.");
      }
    },
    [sessionId, say, draft, options, router],
  );

  const cancel = useCallback(async () => {
    if (draft) {
      await fetch(`/api/orders/${draft.id}/cancel`, { method: "POST" }).catch(() => null);
      setDraft(null);
      setDupAck(false);
      setPhase("idle");
      await say("Okay, I cancelled that. Nothing was charged. What else do you need?");
      return;
    }
    setOptions(null);
    setPhase("idle");
    await say("Okay. What else do you need?");
  }, [draft, say]);

  const confirm = useCallback(async () => {
    if (!draft) return;
    setPhase("busy");
    let out: ConfirmResponse;
    try {
      const res = await fetch(`/api/orders/${draft.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateAcknowledged: dupAck }),
      });
      out = (await res.json()) as ConfirmResponse;
    } catch {
      out = { outcome: "error", message: "Sorry, something went wrong. Nothing was charged." };
    }
    switch (out.outcome) {
      case "pay":
        if (settings.screenReader) {
          // The app's voice is off, so don't navigate away before the screen reader has read the instructions.
          setDraft(null);
          setPhase("idle");
          setPayUrl(out.approveUrl ?? null);
          await say("Your order is ready to pay. Use the Continue to PayPal link, log in, check the total, and press Pay Now.");
          return;
        }
        await say("I'm opening PayPal now. Log in, check the total, and press Pay Now. I'll be here when you come back.");
        window.location.assign(out.approveUrl ?? "/talk");
        return;
      case "caregiver":
        setDraft(null);
        setPhase("waiting");
        setWatch({ id: draft.id, last: "AWAITING_CAREGIVER" });
        await say(caregiverSentMessage(out.caregiverName ?? caregiverName, out.emailed === true));
        return;
      case "blocked":
        setDraft(null);
        setPhase("idle");
        await say(`I stopped this order to keep you safe. ${(out.reasons ?? []).join(" ")} Never buy gift cards or send money because someone called you. I've let ${out.caregiverName} know.`);
        return;
      case "recheck":
        setDupAck(true);
        setPhase("confirm");
        await say(out.message ?? "You ordered this already. Say confirm to order it again.");
        return;
      default:
        setPhase("confirm");
        await say(out.message ?? "Sorry, something went wrong. Nothing was charged.");
    }
  }, [draft, dupAck, say, settings.screenReader, caregiverName]);

  const handleText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setLines((l) => [...l, { who: "you", text }]);
      const mode: Mode = phase === "options" || phase === "confirm" ? phase : "idle";
      const cmd = parseCommand(text, mode);
      switch (cmd.type) {
        case "repeat":
          await speak(lastHelper.current || HELP);
          return;
        case "slower": {
          const next = { ...settings, rate: Math.max(0.6, Number((settings.rate - 0.1).toFixed(2))) };
          setSettings(next);
          saveSettings(next);
          await say("Okay, I'll speak more slowly.");
          return;
        }
        case "help":
          await say(HELP);
          return;
        case "cancel":
          await cancel();
          return;
        case "back":
          if (draft) await cancel();
          else await speak(lastHelper.current || HELP);
          return;
        case "confirm":
          await confirm();
          return;
        case "select":
          await callAgent(`I'd like option ${cmd.index + 1}.`);
          return;
        case "say":
          await callAgent(cmd.text);
          return;
      }
    },
    [phase, settings, speak, say, cancel, confirm, callAgent, draft],
  );

  useEffect(() => {
    handleTextRef.current = (t) => void handleText(t);
  }, [handleText]);

  // Announce the caregiver's decision or a pending payment as soon as it changes.
  useEffect(() => {
    if (!watch) return;
    if (announced.current?.id !== watch.id) announced.current = { id: watch.id, status: watch.last };
    const seen = announced.current;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/orders/${watch.id}`).catch(() => null);
      if (!res?.ok) return;
      const o = (await res.json()) as OrderView;
      if (o.status === seen.status) return;
      seen.status = o.status;
      const payer = o.payerRole === "caregiver" ? `${caregiverName} paid` : "Your payment went through";
      if (o.status === "AWAITING_PAYMENT") void say(`${caregiverName} approved your ${o.title} and is paying for it now.`);
      else if (o.status === "PAID" || o.status === "SHIPPED") {
        void say(`${payer} for your ${o.title}. It's on the way.`);
        setWatch(null);
        setPhase("idle");
      } else if (o.status === "DECLINED") {
        void say(`${caregiverName} said not this time.${o.declineReason ? ` The reason was: ${o.declineReason}` : ""}`);
        setWatch(null);
        setPhase("idle");
      } else if (o.status === "CANCELLED") {
        void say("The payment wasn't finished, so nothing was charged.");
        setWatch(null);
        setPhase("idle");
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [watch, caregiverName, say]);

  // Coming back from PayPal: show the result as text (speech may be blocked without a tap).
  useEffect(() => {
    if (!returnedOrderId || !paymentResult) return;
    void (async () => {
      const res = await fetch(`/api/orders/${returnedOrderId}`).catch(() => null);
      if (!res?.ok) {
        const message = paymentResultMessage(null, paymentResult, caregiverName);
        setReturned(message);
        void say(message);
        return;
      }
      const o = (await res.json()) as OrderView;
      const message = paymentResultMessage(o, paymentResult, caregiverName);
      setReturned(message);
      if (paymentResult === "pending") setWatch({ id: o.id, last: o.status });
      void say(message);
    })();
    // Runs once on arrival from PayPal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const onControl = Boolean(target?.closest("button, a"));
      if (e.key === " " && !onControl) {
        e.preventDefault();
        speech.toggle();
      } else if (e.key === "Enter" && !onControl && phase === "confirm") {
        e.preventDefault();
        void confirm();
      } else if (["1", "2", "3"].includes(e.key) && phase === "options" && options && Number(e.key) <= options.length) {
        e.preventDefault();
        void handleText(`option ${e.key}`);
      } else if (e.key === "Escape" && (phase === "confirm" || phase === "options")) {
        e.preventDefault();
        void cancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, options, speech, confirm, cancel, handleText]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.6rem] font-bold">Hello {seniorName}</h1>
      </div>
      <SettingsBar
        settings={settings}
        onChange={(s) => {
          setSettings(s);
          saveSettings(s);
        }}
      />

      {payUrl ? (
        <section aria-labelledby="pay-h" className="flex flex-col gap-2 rounded-2xl border-[3px] p-4">
          <h2 id="pay-h" className="font-bold">
            Ready to pay
          </h2>
          <a ref={payLink} href={payUrl} className="btn btn-primary inline-flex items-center justify-center">
            Continue to PayPal
          </a>
        </section>
      ) : null}

      {returned ? (
        <section aria-labelledby="result-h" className="flex flex-col gap-2 rounded-2xl border-[3px] p-4">
          <h2 id="result-h" className="font-bold">
            Your payment
          </h2>
          <p className="text-[1.3rem]">{returned}</p>
          <button type="button" className="btn" onClick={() => void speak(returned)}>
            Tap to hear
          </button>
        </section>
      ) : null}

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          className="btn btn-primary w-full text-[1.4rem]"
          style={{ minHeight: 120 }}
          aria-pressed={speech.listening}
          disabled={speech.supported === false || phase === "busy" || speech.transcribing}
          onClick={speech.toggle}
        >
          {speech.listening ? "Listening… tap to stop" : phase === "busy" || speech.transcribing ? "Thinking…" : "Tap to talk (Space)"}
        </button>
        {speech.listening && speech.heard ? <p className="text-center">Heard: &ldquo;{speech.heard}&rdquo;</p> : null}
        {speech.supported === false ? <p>Voice isn&apos;t available in this browser. Please type below.</p> : null}
        {speech.error === "no-speech" && !speech.listening ? <p role="status">I didn&apos;t hear anything. Tap to talk and try again, or type below.</p> : null}
        {speech.error === "mic-blocked" ? <p role="alert">The microphone is blocked. Please allow it in your browser, or type below.</p> : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = typed;
          setTyped("");
          void handleText(text);
        }}
      >
        <label htmlFor="typed">Or type what you need</label>
        <div className="flex gap-2">
          <input id="typed" className="field flex-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn">
            Send
          </button>
        </div>
      </form>

      {options && phase === "options" ? <OptionCards options={options} headingRef={optionsHeading} onPick={(i) => void handleText(`option ${i + 1}`)} /> : null}
      {draft && phase === "confirm" ? <ReadBack draft={draft} headingRef={readBackHeading} onConfirm={() => void confirm()} onCancel={() => void cancel()} /> : null}

      <section aria-labelledby="convo-h">
        <h2 id="convo-h" className="text-[1.1rem] font-bold">
          Conversation
        </h2>
        <ol className="mt-2 flex flex-col gap-2">
          {lines.map((l, i) => (
            <li key={i} className={l.who === "you" ? "self-end rounded-xl border-[2px] px-3 py-2" : "rounded-xl bg-[var(--card)] px-3 py-2"}>
              <span className="font-bold">{l.who === "you" ? "You: " : "Helper: "}</span>
              {l.text}
            </li>
          ))}
        </ol>
      </section>

      <div role="status" aria-live="polite" className="sr-only">
        {live}
      </div>
    </div>
  );
}
