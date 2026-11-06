"use client";

/**
 * The voice on the headsets: the computer's own voices (they work offline), out of its main audio output — pick the
 * interface that feeds the intercom as the output in the computer's sound settings. Plus a short attention tone,
 * and the browser's built-in translator for the crew's languages.
 */

const TAGS: Record<string, string> = { es: "es-ES", en: "en-US", pt: "pt-BR", fr: "fr-FR", it: "it-IT", de: "de-DE", nl: "nl-NL", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN" };

export function voicesFor(lang: string) {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
}

/** The voice picked for a language, or the clearest one there is: the system's enhanced voices first. */
function pick(lang: string, name?: string) {
  const vs = voicesFor(lang);
  return vs.find((v) => v.name === name) ?? vs.find((v) => /premium|enhanced|mejorad/i.test(v.name)) ?? vs.find((v) => v.localService) ?? vs[0] ?? null;
}

/** Says a line. `now` cuts off whatever is being said, so a GO lands on its frame. */
export function speak(text: string, lang: string, opts: { voice?: string; rate?: number; now?: boolean } = {}) {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = TAGS[lang] ?? lang;
  const v = pick(lang, opts.voice);
  if (v) u.voice = v;
  u.rate = opts.rate ?? 1;
  u.volume = 1;
  if (opts.now) speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export const hush = () => typeof speechSynthesis !== "undefined" && speechSynthesis.cancel();

let ctx: AudioContext | null = null;
/** Two short beeps, like an intercom call light. */
export function beep() {
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  for (const [at, f] of [
    [0, 988],
    [0.14, 1319],
  ]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(0.5, t + at + 0.01);
    g.gain.linearRampToValueAtTime(0, t + at + 0.11);
    o.connect(g).connect(ctx.destination);
    o.start(t + at);
    o.stop(t + at + 0.12);
  }
}

// ---------- translation: Chrome's built-in translator, on the computer ----------

interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<{ translate(text: string): Promise<string> }>;
}

const api = () => (globalThis as unknown as { Translator?: TranslatorApi }).Translator ?? null;
export const canTranslate = () => !!api();

/** Each text in another language; throws "unsupported" without the browser's translator, "pair" without that pair. */
export async function translate(texts: string[], from: string, to: string, onProgress?: (share: number) => void) {
  const T = api();
  if (!T) throw new Error("unsupported");
  // some browsers have the API without the language models and never answer
  const avail = await Promise.race([T.availability({ sourceLanguage: from, targetLanguage: to }), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 15000))]);
  if (avail === "timeout") throw new Error("unsupported");
  if (avail === "unavailable") throw new Error("pair");
  const tr = await T.create({
    sourceLanguage: from,
    targetLanguage: to,
    monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.((e as ProgressEvent).loaded)),
  });
  const out: Record<string, string> = {};
  for (const t of texts) out[t] = await tr.translate(t);
  return out;
}
