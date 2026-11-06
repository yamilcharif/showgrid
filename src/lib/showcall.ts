/**
 * Show call: cues on a timecode timeline, each spoken to the crew's headsets when the clock reaches it.
 * A GO cue is called in two parts — its name a moment before ("Pyro 3…") and "GO" right on the frame — with a
 * standby some seconds earlier. A note is read out as written. Lines can be spoken in the crew's own language.
 * Cues belong to songs (like a console's timecode pools): only the song playing fires, so two songs that reuse the
 * same timecode never fire each other's cues.
 */
import { parseTc, type Fps } from "./timecode";

export type CueKind = "go" | "say";

export interface Dept {
  id: string;
  name: string;
  color: string;
  /** languages its lines are spoken in, in order ("es", "pt"…); empty takes the show's */
  langs: string[];
  /** muted: its cues stay on the timeline but aren't sent */
  muted?: boolean;
}

export interface Song {
  id: string;
  name: string;
}

export interface Cue {
  id: string;
  /** the song it belongs to */
  song: string;
  /** seconds from 00:00:00:00 */
  t: number;
  kind: CueKind;
  /** what's called: "Pyro 3", "Spot 1 pick up the singer" */
  label: string;
  /** a note: read out as written, instead of the standby and GO */
  text: string;
  dept: string | null;
  /** seconds before the GO for its standby; null takes the show's, 0 for none */
  standby: number | null;
  off?: boolean;
  /** translations of its spoken lines: lang → source line → text */
  tr?: Record<string, Record<string, string>>;
}

export interface ShowCall {
  name: string;
  fps: Fps;
  /** the language the cues are written in */
  lang: string;
  /** languages spoken, in order, for departments that don't set their own */
  langs: string[];
  standby: number;
  /** how long before the frame the cue's name is said, so "GO" lands on it */
  callAhead: number;
  /** the word said on the frame */
  goWord: string;
  standbyWord: string;
  /** say the department before the cue: "Pyro: standby 3" */
  sayDept: boolean;
  /** a short tone before standbys and notes, to get attention */
  beep: boolean;
  rate: number;
  /** voice picked per language: lang → voice name */
  voices: Record<string, string>;
  depts: Dept[];
  songs: Song[];
  /** the song playing: only its cues fire */
  current: string | null;
  cues: Cue[];
}

export const LANGS: { code: string; name: string }[] = [
  { code: "es", name: "Español" },
  { code: "en", name: "English" },
  { code: "pt", name: "Português" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "de", name: "Deutsch" },
  { code: "nl", name: "Nederlands" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
];

export const DEPT_COLORS = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#00897b", "#6d4c41"];

let n = 0;
export const newId = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export const SHOWCALL_START: ShowCall = {
  name: "",
  fps: 30,
  lang: "es",
  langs: ["es"],
  standby: 10,
  callAhead: 1.2,
  goWord: "GO",
  standbyWord: "Standby",
  sayDept: true,
  beep: true,
  rate: 1,
  voices: {},
  depts: [
    { id: "lx", name: "Luces", color: "#1e88e5", langs: [] },
    { id: "laser", name: "Láser", color: "#43a047", langs: [] },
    { id: "pyro", name: "Pyro", color: "#e53935", langs: [] },
    { id: "stage", name: "Stage", color: "#6d4c41", langs: [] },
    { id: "spot", name: "Seguidores", color: "#fb8c00", langs: [] },
    { id: "dance", name: "Bailarines", color: "#d81b60", langs: [] },
    { id: "cam", name: "Cámaras", color: "#00897b", langs: [] },
    { id: "video", name: "Video", color: "#8e24aa", langs: [] },
  ],
  songs: [{ id: "s1", name: "Intro" }],
  current: "s1",
  cues: [],
};

export const sortCues = (cues: Cue[]) => [...cues].sort((a, b) => a.t - b.t);

// ---------- what is said, and when ----------

export type LineRole = "standby" | "call" | "go" | "say";

/** One thing said at one moment. `text` is in the show's language; `key` names it for its translations. */
export interface Line {
  at: number;
  cue: Cue;
  role: LineRole;
  text: string;
}

const deptOf = (s: ShowCall, c: Cue) => s.depts.find((d) => d.id === c.dept) ?? null;

/** The lines a cue speaks, in the show's language, with when each is due. */
export function linesOf(s: ShowCall, c: Cue): Line[] {
  if (c.off) return [];
  const d = deptOf(s, c);
  // the department first, unless the cue's name already starts with it ("Pyro 3")
  const named = (c.text.trim() || c.label).toLowerCase().startsWith((d?.name ?? "").toLowerCase());
  const who = s.sayDept && d && !named ? `${d.name}. ` : "";
  if (c.kind === "say" || c.text.trim()) return [{ at: c.t, cue: c, role: "say", text: `${who}${c.text.trim() || c.label}` }];
  const label = c.label.trim();
  if (!label) return [{ at: c.t, cue: c, role: "go", text: s.goWord }];
  const sb = c.standby ?? s.standby;
  const out: Line[] = [];
  if (sb > 0) out.push({ at: c.t - sb, cue: c, role: "standby", text: `${who}${s.standbyWord} ${label}` });
  out.push({ at: c.t - Math.max(0, s.callAhead), cue: c, role: "call", text: label });
  out.push({ at: c.t, cue: c, role: "go", text: s.goWord });
  return out;
}

/** Every line of one song, in time order. */
export const songLines = (s: ShowCall, song: string | null) =>
  s.cues.filter((c) => c.song === song).flatMap((c) => linesOf(s, c)).sort((a, b) => a.at - b.at);

/** The languages a cue's lines are spoken in. */
export const langsFor = (s: ShowCall, c: Cue) => {
  const d = deptOf(s, c);
  const langs = d?.langs.length ? d.langs : s.langs;
  return langs.length ? langs : [s.lang];
};

/** A line in one language: the original, its saved translation, or null when it still needs translating. */
export function inLang(s: ShowCall, line: Line, lang: string): string | null {
  if (lang === s.lang) return line.text;
  // "GO" is the same word everywhere on a show
  if (line.role === "go") return line.text;
  return line.cue.tr?.[lang]?.[line.text] ?? null;
}

/**
 * Lines due as the clock moves from `from` to `to`. Only a forward step of under a second fires anything: a jump
 * (locating, a timecode restart, a stop) moves the clock without calling everything skipped.
 */
export function dueBetween(lines: Line[], from: number, to: number) {
  if (!(to > from) || to - from > 1) return [];
  return lines.filter((l) => l.at > from && l.at <= to);
}

// ---------- importing cue lists ----------

/**
 * Cues from a table (CSV, Excel, pasted): a cell that reads as a time, a name, and optionally a department and a note.
 * With headers, the columns are found by name; without, the first time-like cell is the time and the next is the name.
 */
export function cuesFromRows(rows: string[][], s: ShowCall, song: string): Cue[] {
  const head = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const ti = find(/^(tc|time|timecode|tiempo|hora|start|trig)/);
  const li = find(/^(cue|name|label|nombre|cue name|descripci)/);
  const di = find(/^(dept|department|departamento|depto|area|área|track)/);
  const ni = find(/^(note|notes|nota|notas|text|texto|say|decir)/);
  const hasHead = ti >= 0;
  const out: Cue[] = [];
  for (const r of hasHead ? rows.slice(1) : rows) {
    const cells = r.map((c) => c.trim());
    let t: number | null = null;
    let tCell = ti;
    if (hasHead) t = parseTc(cells[ti] ?? "", s.fps);
    else
      for (let i = 0; i < cells.length && t == null; i++) {
        t = /\d[:.;]\d/.test(cells[i]) || /^\d+(\.\d+)?$/.test(cells[i]) ? parseTc(cells[i], s.fps) : null;
        if (t != null) tCell = i;
      }
    if (t == null) continue;
    const label = hasHead && li >= 0 ? cells[li] ?? "" : cells.find((c, i) => i !== tCell && /[a-z]/i.test(c)) ?? "";
    const deptName = di >= 0 ? cells[di] ?? "" : "";
    const dept = s.depts.find((d) => deptName && d.name.toLowerCase() === deptName.toLowerCase())?.id ?? null;
    const note = ni >= 0 ? cells[ni] ?? "" : "";
    out.push({ id: newId(), song, t, kind: note ? "say" : "go", label: label.slice(0, 80), text: note.slice(0, 300), dept, standby: null });
  }
  return sortCues(out);
}

// ---------- grandMA3 timecode pools ----------
// An exported pool (XML) holds one Timecode object (the song) with track groups, each with tracks (one sequence
// each) and their events: Go+ / Goto with the cue they go to, Temp and Flash hits (each followed by its release),
// On and Off. Most shows keep a "Master" track (often in a markers group) whose cues name the song's sections —
// INTRO, VERSE, DROP — which is what a caller calls.

export type Ma3Kind = "cue" | "hit" | "onoff";

export interface Ma3Event {
  t: number;
  kind: Ma3Kind;
  label: string;
}

export interface Ma3Track {
  key: string;
  name: string;
  group: string;
  /** the song's sections: a markers group, or a track named after the song or "… - Master" */
  master: boolean;
  events: Ma3Event[];
}

export interface Ma3Song {
  name: string;
  tracks: Ma3Track[];
}

const unescape = (v: string) => v.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attrsOf = (s: string) => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], unescape(m[2])]));

/** MA3 times: 3h02m48.890, 12m03.456, 3.456, 1d02h…; null past a day (the console leaves some stray values). */
export function ma3Time(v: string): number | null {
  const m = v.trim().match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const t = (+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * 3600 + +(m[3] ?? 0) * 60 + +m[4];
  return t < 86400 ? t : null;
}

const CUE_EVENTS = /^(go\+|go-|goto|top|load)$/i;
const HIT_EVENTS = /^(temp|flash|swap|toggle)$/i;
const ONOFF_EVENTS = /^(on|off)$/i;

/** Every Timecode object in an export, with its tracks and their events (presses only, not releases). */
export function readMa3(xml: string, fileName = ""): Ma3Song[] {
  const songs: Ma3Song[] = [];
  let song: Ma3Song | null = null;
  let group = "";
  let track: Ma3Track | null = null;
  let ev: { name: string; t: number | null; dest: string } | null = null;
  for (const m of xml.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (close) {
      if (tag === "Timecode") song = null;
      else if (tag === "TrackGroup") group = "";
      else if (tag === "Track") track = null;
      else if (tag === "CmdEvent") ev = null;
      continue;
    }
    const a = attrsOf(rest);
    if (tag === "Timecode") {
      song = { name: a.Name || fileName.replace(/\.xml$/i, ""), tracks: [] };
      songs.push(song);
    } else if (tag === "TrackGroup" && !self) group = a.Name ?? "";
    else if (tag === "Track" && song && !self) {
      const name = a.Name ?? "";
      const sn = song.name.toLowerCase();
      const master = /marker/i.test(group) ? /master$/i.test(name) || name.toLowerCase() === sn || song.tracks.every((x) => !x.master) : /-\s*master$/i.test(name) || name.toLowerCase() === sn;
      track = { key: `${song.name}::${song.tracks.length}`, name, group, master, events: [] };
      song.tracks.push(track);
    } else if (tag === "CmdEvent" && track) {
      ev = { name: a.Name ?? "", t: ma3Time(a.Time ?? ""), dest: a.CueDestination ?? "" };
      if (self) ev = null;
    } else if (tag === "RealtimeCmd" && ev && track && ev.t != null) {
      // a press, not its release
      if (a.Status !== "On" || /\(Release\)$/.test(ev.name)) continue;
      const word = ev.name || a.ExecToken || "";
      const kind: Ma3Kind | null = CUE_EVENTS.test(word) ? "cue" : HIT_EVENTS.test(word) ? "hit" : ONOFF_EVENTS.test(word) ? "onoff" : null;
      if (!kind) continue;
      // the cue's name: "CORO", "[FULL/Red]" → "FULL/Red"; internal addresses (0.5.197.1000) aren't names
      let label = ev.dest.replace(/^\[|\]$/g, "").trim();
      if (/^[\d.]+$/.test(label)) label = "";
      track.events.push({ t: ev.t, kind, label: kind === "onoff" ? `${word}${label ? ` ${label}` : ""}` : label });
    }
  }
  for (const s of songs) for (const tr of s.tracks) tr.events.sort((x, y) => x.t - y.t);
  return songs.filter((s) => s.tracks.some((t) => t.events.length));
}

/** What to bring in: which tracks, which kinds of events, and how close hits merge into one cue. */
export interface Ma3Pick {
  tracks: string[];
  kinds: Ma3Kind[];
  /** seconds: events on the same track closer than this become one cue ("GOLPE ×4") */
  merge: number;
}

/** Tracks picked to start with: each song's sections, or the tracks that change cues when there's no master. */
export function ma3Default(songs: Ma3Song[]): Ma3Pick {
  const tracks = songs.flatMap((s) => {
    const masters = s.tracks.filter((t) => t.master && t.events.some((e) => e.kind === "cue"));
    return (masters.length ? masters : s.tracks.filter((t) => t.events.some((e) => e.kind === "cue"))).map((t) => t.key);
  });
  return { tracks, kinds: ["cue"], merge: 1 };
}

/** A track's name without the song's in front: "BON BON - snare" → "snare". */
const shortName = (song: string, track: string) => track.replace(new RegExp(`^${song.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-?\\s*`, "i"), "").trim() || track;

/** The cues a pick makes from one song. */
export function ma3Cues(song: Ma3Song, pick: Ma3Pick, songId: string, depts: Dept[]): Cue[] {
  const out: Cue[] = [];
  for (const tr of song.tracks) {
    if (!pick.tracks.includes(tr.key)) continue;
    const dept = depts.find((d) => tr.group && d.name.toLowerCase() === tr.group.toLowerCase())?.id ?? null;
    const prefix = tr.master ? "" : shortName(song.name, tr.name);
    let run: { first: Ma3Event; last: Ma3Event; n: number } | null = null;
    const flush = () => {
      if (!run) return;
      const base = run.first.label || (tr.master ? song.name : "");
      const label = [prefix, base].filter(Boolean).join(" · ") || tr.name;
      out.push({ id: newId(), song: songId, t: run.first.t, kind: "go", label: `${label}${run.n > 1 ? ` ×${run.n}` : ""}`.slice(0, 80), text: "", dept, standby: null });
      run = null;
    };
    for (const e of tr.events) {
      if (!pick.kinds.includes(e.kind)) continue;
      if (run && e.label === run.first.label && e.t - run.last.t < pick.merge) {
        run.last = e;
        run.n++;
        continue;
      }
      flush();
      run = { first: e, last: e, n: 1 };
    }
    flush();
  }
  return sortCues(out);
}

/**
 * Song names from a set list (the text of a PDF, a photo read by OCR, or pasted): one per line, without the
 * numbering, lengths, keys or tempos printed around them, and without the header.
 */
export function songsFromSetList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    // numbering: "1.", "01 -", "#3", "3)"
    line = line.replace(/^(#?\d{1,3}\s*[.)\-–:]?\s+)/, "");
    // lengths, keys, tempos at the end: "3:45", "(Am)", "120 bpm"
    line = line.replace(/\s+\(?\d{1,2}:\d{2}\)?\s*$/, "").replace(/\s+\d{2,3}\s*bpm\s*$/i, "").replace(/\s+\([A-G][#b]?m?\)\s*$/, "");
    line = line.replace(/\s{2,}/g, " ").trim();
    if (line.length < 2 || line.length > 60 || !/[a-zà-ÿ]{2}/i.test(line)) continue;
    if (/^(set\s*list|setlist|show|encore\s*break|fecha|date|venue|lugar)\b\s*[:\-]?\s*$/i.test(line)) continue;
    // a header with the date: "MIAMI 20/11"
    if (/\b\d{1,2}[/.\-]\d{1,2}([/.\-]\d{2,4})?\b/.test(line)) continue;
    out.push(line);
  }
  return out.slice(0, 80);
}

/** The cue list as CSV, one row per cue. */
export function cuesCsv(s: ShowCall, fmt: (t: number) => string) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [["Song", "Timecode", "Cue", "Department", "Kind", "Note", "Standby (s)"]];
  const order = new Map(s.songs.map((x, i) => [x.id, i]));
  for (const c of [...s.cues].sort((a, b) => (order.get(a.song) ?? 999) - (order.get(b.song) ?? 999) || a.t - b.t))
    rows.push([s.songs.find((x) => x.id === c.song)?.name ?? "", fmt(c.t), c.label, s.depts.find((d) => d.id === c.dept)?.name ?? "", c.kind === "go" ? "GO" : "Note", c.text, String(c.standby ?? s.standby)]);
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
