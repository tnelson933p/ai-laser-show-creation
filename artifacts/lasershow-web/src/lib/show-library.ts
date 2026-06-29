import type { ShowOverrides } from "./show-engine";

// ─── Chat message (shared between Dashboard and ShowChat) ──────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  displayContent: string;
  settingsApplied?: Partial<ShowOverrides>;
}

// ─── Show save format ──────────────────────────────────────────────────────────
export interface SetlistTrackMeta {
  filename: string;
  bpm: number;
  durationSecs: number;
}

export interface ShowSave {
  id: string;
  name: string;
  createdAt: number;
  laserBrand: string;
  laserModel: string;
  messages: ChatMessage[];
  overrides: ShowOverrides;
  setlistMeta: SetlistTrackMeta[];
}

// ─── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = "ai-lasershow-library-v1";

export function loadLibrary(): ShowSave[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ShowSave[];
  } catch {
    return [];
  }
}

export function saveLibrary(shows: ShowSave[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shows));
  } catch { /* storage full or unavailable */ }
}
