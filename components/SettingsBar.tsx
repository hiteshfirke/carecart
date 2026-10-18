"use client";

import { useEffect } from "react";

export type Settings = { rate: number; scale: number; screenReader: boolean };
export const DEFAULT_SETTINGS: Settings = { rate: 0.9, scale: 1, screenReader: false };
const KEY = "carecart-settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings then last for this visit only.
  }
}

export function SettingsBar({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  useEffect(() => {
    document.documentElement.style.setProperty("--scale", String(settings.scale));
  }, [settings.scale]);

  return (
    <div role="group" aria-label="Text size and voice settings" className="flex flex-wrap gap-2">
      <button type="button" className="btn" onClick={() => onChange({ ...settings, scale: Math.max(0.9, Number((settings.scale - 0.1).toFixed(1))) })}>
        A−<span className="sr-only"> smaller text</span>
      </button>
      <button type="button" className="btn" onClick={() => onChange({ ...settings, scale: Math.min(1.6, Number((settings.scale + 0.1).toFixed(1))) })}>
        A+<span className="sr-only"> bigger text</span>
      </button>
      <button type="button" className="btn" aria-pressed={settings.screenReader} onClick={() => onChange({ ...settings, screenReader: !settings.screenReader })}>
        Screen reader mode
      </button>
    </div>
  );
}
