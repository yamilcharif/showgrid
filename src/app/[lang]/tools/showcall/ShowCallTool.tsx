"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18n";
import { ProjectBar, useToolState } from "@/components/Projects";
import { ToolFiles } from "@/components/ToolFiles";
import { fmt, plural } from "@/lib/i18n/config";
import { parseTable, readTable } from "@/lib/labels";
import {
  DEPT_COLORS,
  LANGS,
  SHOWCALL_START,
  cuesCsv,
  ma3Cues,
  ma3Default,
  readMa3,
  cuesFromRows,
  dueBetween,
  inLang,
  langsFor,
  linesOf,
  newId,
  songLines,
  songsFromSetList,
  sortCues,
  type Cue,
  type Line,
  type Ma3Kind,
  type Ma3Pick,
  type Ma3Song,
  type ShowCall,
} from "@/lib/showcall";
import { FPS_LIST, fmtTc, parseTc, type Fps } from "@/lib/timecode";
import { ShowClock, audioInputs, midiInputs, type Source } from "./clock";
import { beep, canTranslate, hush, speak, translate, voicesFor } from "./voice";

const ZOOMS = [20, 60, 300];

const merge = (v: unknown): ShowCall => {
  if (!v || typeof v !== "object" || !Array.isArray((v as ShowCall).cues)) return SHOWCALL_START;
  const s = { ...SHOWCALL_START, ...(v as ShowCall) };
  if (!s.songs?.length) s.songs = SHOWCALL_START.songs;
  if (!s.songs.some((x) => x.id === s.current)) s.current = s.songs[0].id;
  return s;
};

/** Timecode in, cues out: a timeline of songs and cues, each called to the crew's headsets on its frame. */
export function ShowCallTool() {
  const { t: T } = useI18n();
  const t = T.showcall;
  const { state: s, setState: setS, project, saving } = useToolState<ShowCall>("showcall", "sg_showcall", SHOWCALL_START, merge);
  const set = (patch: Partial<ShowCall>) => setS((x) => ({ ...x, ...patch }));
  const setCue = (id: string, patch: Partial<Cue>) => setS((x) => ({ ...x, cues: x.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // the clock lives as long as the page; the loop below reads it every tick
  const [clock] = useState(() => new ShowClock());
  const [source, setSource] = useState<Source>("internal");
  const [inputs, setInputs] = useState<{ id: string; name: string }[]>([]);
  const [inputId, setInputId] = useState("");
  const [channel, setChannel] = useState(0);
  const [armed, setArmed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(60);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [paste, setPaste] = useState("");
  const [ma3, setMa3] = useState<{ songs: Ma3Song[]; pick: Ma3Pick } | null>(null);
  const [fired, setFired] = useState<{ id: string; role: string } | null>(null);
  const [, setVoicesTick] = useState(0);
  // the clock as last drawn, ~15 times a second (the timecode digits themselves are drawn every tick)
  const [now, setNow] = useState(0);
  const tcRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setListRef = useRef<HTMLInputElement>(null);

  const song = s.songs.find((x) => x.id === s.current) ?? s.songs[0];
  const cues = useMemo(() => sortCues(s.cues.filter((c) => c.song === song?.id)), [s.cues, song?.id]);
  const lines = useMemo(() => songLines(s, song?.id ?? null), [s, song?.id]);
  const deptOf = (c: Cue) => s.depts.find((d) => d.id === c.dept) ?? null;

  useEffect(() => clock.setFps(s.fps), [clock, s.fps]);

  const say = (line: Line) => {
    const langs = langsFor(s, line.cue);
    const voiceOf = (l: string) => s.voices[l];
    if (line.role === "go") return speak(line.text, langs[0], { voice: voiceOf(langs[0]), rate: s.rate, now: true });
    if (line.role === "call") {
      const l = langs[0];
      const text = inLang(s, line, l);
      return text ? speak(text, l, { voice: voiceOf(l), rate: s.rate }) : speak(line.text, s.lang, { voice: voiceOf(s.lang), rate: s.rate });
    }
    if (s.beep) beep();
    for (const l of langs) {
      const text = inLang(s, line, l);
      // not translated yet: said in the language it was written in
      if (text) speak(text, l, { voice: voiceOf(l), rate: s.rate });
      else speak(line.text, s.lang, { voice: voiceOf(s.lang), rate: s.rate });
    }
  };

  // the loop: every 20 ms, move the clock and call what came due (the last time read survives edits to the cues)
  const last = useRef<number | null>(null);
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      const tNow = clock.now();
      const st = clock.status();
      if (tcRef.current) tcRef.current.textContent = fmtTc(tNow, s.fps);
      if (meterRef.current) meterRef.current.style.width = `${Math.round(Math.min(1, clock.level) * 100)}%`;
      if (statusRef.current) statusRef.current.dataset.state = st;
      if (armed && st === "locked" && last.current != null) {
        // muted departments stay quiet; cues landing together share one GO
        const due = dueBetween(lines, last.current, tNow).filter((l) => !s.depts.find((d) => d.id === l.cue.dept)?.muted);
        let go = false;
        for (const line of due) {
          if (line.role === "go") {
            if (go) continue;
            go = true;
          }
          say(line);
          setFired({ id: line.cue.id, role: line.role });
        }
      }
      last.current = tNow;
      if (++n % 4 === 0) setNow(tNow);
    }, 20);
    return () => window.clearInterval(id);
  }, [clock, s, lines, armed]); // eslint-disable-line react-hooks/exhaustive-deps -- say reads the same s

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const on = () => setVoicesTick((x) => x + 1);
    speechSynthesis.addEventListener("voiceschanged", on);
    return () => speechSynthesis.removeEventListener("voiceschanged", on);
  }, []);

  useEffect(() => () => void clock.stop(), [clock]);

  // ---------- the clock's source ----------

  // only the latest choice of source counts: a slow failure of an earlier one doesn't undo it
  const sourceReq = useRef(0);
  const pickSource = async (src: Source, id = inputId, ch = channel, test = false) => {
    const req = ++sourceReq.current;
    setMsg(null);
    setSource(src);
    const c = clock;
    try {
      if (src === "internal") return c.useInternal();
      if (src === "ltc") {
        await c.startLtc(id, ch, test);
        // device names show once the browser has been allowed the microphone
        if (!test) setInputs(await audioInputs());
      } else {
        const list = await midiInputs();
        if (!list) throw new Error("no-midi-api");
        setInputs(list);
        await c.startMtc(id || list[0]?.id || "");
      }
    } catch (e) {
      if (req !== sourceReq.current) return;
      c.useInternal();
      setSource("internal");
      const code = (e as Error).message;
      setMsg({ ok: false, text: code === "no-midi-api" ? t.errNoMidiApi : code === "no-midi" ? t.errNoMidi : src === "ltc" ? t.errAudio : t.errMidi });
    }
  };

  // ---------- cues ----------

  const markCue = () => {
    if (!song) return;
    const c: Cue = { id: newId(), song: song.id, t: Math.round(clock.now() * 100) / 100, kind: "go", label: `${t.cueWord} ${cues.length + 1}`, text: "", dept: null, standby: null };
    setS((x) => ({ ...x, cues: [...x.cues, c] }));
    setSelected(c.id);
  };

  const preview = (c: Cue) => {
    const ls = linesOf(s, c);
    ls.forEach((line, i) => window.setTimeout(() => say(line), i * 1400));
  };

  // keys: space plays and pauses the internal clock, M marks a cue at the current time
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === " " && clock.source === "internal") {
        e.preventDefault();
        if (clock.isRunning()) clock.pause();
        else clock.play();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        markCue();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- songs ----------

  const addSongs = (names: string[]) => {
    if (!names.length) return setMsg({ ok: false, text: t.errNoSongs });
    setS((x) => {
      // a fresh show starts over with the set list; otherwise the new songs go after the ones there
      const fresh = !x.cues.length;
      const have = new Set(fresh ? [] : x.songs.map((y) => y.name.toLowerCase()));
      const add = names.filter((n) => !have.has(n.toLowerCase())).map((name) => ({ id: newId(), name }));
      const songs = fresh ? add : [...x.songs, ...add];
      return { ...x, songs: songs.length ? songs : x.songs, current: songs[0]?.id ?? x.current };
    });
    setMsg({ ok: true, text: fmt(t.songsAdded, { n: names.length }) });
  };

  const readSetList = async (f: File) => {
    setBusy(t.readingSetList);
    setMsg(null);
    try {
      let text = "";
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const { pdfText } = await import("@/lib/rider");
        text = await pdfText(f);
      } else if (f.type.startsWith("image/")) {
        // the photo is read on this computer
        const { createWorker } = await import("tesseract.js");
        const w = await createWorker("eng+spa+por");
        text = (await w.recognize(f)).data.text;
        await w.terminate();
      } else text = await f.text();
      addSongs(songsFromSetList(text));
    } catch {
      setMsg({ ok: false, text: t.errSetList });
    } finally {
      setBusy("");
    }
  };

  const importCues = async (files: File[]) => {
    if (!song || !files.length) return;
    setBusy(t.importing);
    setMsg(null);
    try {
      const xmls = files.filter((f) => /\.xml$/i.test(f.name));
      if (xmls.length) {
        // grandMA3 timecode pools: read them all, then pick the tracks before importing
        const songs = (await Promise.all(xmls.map(async (f) => readMa3(await f.text(), f.name)))).flat();
        if (!songs.length) throw new Error("none");
        setMa3({ songs, pick: ma3Default(songs) });
        return;
      }
      const found = cuesFromRows(await readTable(files[0]), s, song.id);
      if (!found.length) throw new Error("none");
      setS((x) => ({ ...x, cues: [...x.cues, ...found] }));
      setMsg({ ok: true, text: fmt(t.imported, { n: found.length }) });
    } catch {
      setMsg({ ok: false, text: t.errImport });
    } finally {
      setBusy("");
    }
  };

  const ma3Count = ma3 ? ma3.songs.reduce((a, x) => a + ma3Cues(x, ma3.pick, "", s.depts).length, 0) : 0;
  const finishMa3 = () => {
    if (!ma3) return;
    setS((x) => {
      const songs = [...x.songs];
      // a fresh show takes the pools' songs in place of the empty starting one
      const fresh = !x.cues.length && songs.length === 1;
      if (fresh) songs.length = 0;
      const cues = [...x.cues];
      for (const m of ma3.songs) {
        const made = ma3Cues(m, ma3.pick, "", x.depts);
        if (!made.length) continue;
        let target = songs.find((y) => y.name.toLowerCase() === m.name.toLowerCase());
        if (!target) {
          target = { id: newId(), name: m.name };
          songs.push(target);
        }
        cues.push(...made.map((c) => ({ ...c, song: target!.id })));
      }
      if (!songs.length) return x;
      return { ...x, songs, cues, current: fresh ? songs[0].id : x.current };
    });
    setMsg({ ok: true, text: fmt(t.imported, { n: ma3Count }) });
    setMa3(null);
  };
  const setPick = (patch: Partial<Ma3Pick>) => setMa3((m) => (m ? { ...m, pick: { ...m.pick, ...patch } } : m));

  // ---------- translation ----------

  const needed = useMemo(() => {
    const want = new Set<string>();
    for (const l of [...s.langs, ...s.depts.flatMap((d) => d.langs)]) if (l !== s.lang) want.add(l);
    return [...want];
  }, [s.langs, s.depts, s.lang]);

  const translateAll = async () => {
    setMsg(null);
    try {
      let all = s.cues;
      for (const lang of needed) {
        setBusy(fmt(t.translating, { lang: LANGS.find((l) => l.code === lang)?.name ?? lang }));
        const lines = all.flatMap((c) => linesOf(s, c)).filter((l) => l.role !== "go" && langsFor(s, l.cue).includes(lang));
        const texts = [...new Set(lines.map((l) => l.text))];
        if (!texts.length) continue;
        const done = await translate(texts, s.lang, lang);
        all = all.map((c) => {
          const mine = linesOf(s, c).filter((l) => done[l.text] != null);
          if (!mine.length) return c;
          const tr = { ...(c.tr ?? {}) };
          tr[lang] = { ...(tr[lang] ?? {}), ...Object.fromEntries(mine.map((l) => [l.text, done[l.text]])) };
          return { ...c, tr };
        });
      }
      setS((x) => ({ ...x, cues: x.cues.map((c) => all.find((y) => y.id === c.id) ?? c) }));
      setMsg({ ok: true, text: t.translated });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message === "unsupported" ? t.errNoTranslator : t.errTranslate });
    } finally {
      setBusy("");
    }
  };

  // ---------- timeline ----------

  const win = { from: now - zoom * 0.2, len: zoom };
  const xOf = (sec: number) => ((sec - win.from) / win.len) * 100;
  const drag = useRef<{ id: string; el: HTMLElement } | null>(null);
  const timeAt = (e: React.PointerEvent, box: HTMLElement) => {
    const r = box.getBoundingClientRect();
    return win.from + ((e.clientX - r.left) / r.width) * win.len;
  };
  // one lane per department (and one for cues without), so cues at the same moment don't hide each other
  const lanes = [
    ...s.depts.map((d) => ({ id: d.id as string | null, name: d.name, color: d.color, muted: !!d.muted })),
    ...(cues.some((c) => !c.dept || !s.depts.some((d) => d.id === c.dept)) ? [{ id: null, name: t.noDept, color: "#888", muted: false }] : []),
  ];
  const muteDept = (id: string) => set({ depts: s.depts.map((d) => (d.id === id ? { ...d, muted: !d.muted } : d)) });
  const sel = s.cues.find((c) => c.id === selected) ?? null;
  const next = cues.find((c) => c.t > now && !c.off);
  const running = clock.isRunning();

  return (
    <div className="sc-tool">
      <ProjectBar project={project} saving={saving} />
      <ToolFiles
        tool="showcall"
        name={project?.name ?? (s.name || "show-call")}
        data={s}
        onOpen={(v) => setS(merge(v))}
        downloadLabel={t.downloadCsv}
        download={s.cues.length ? async () => ({ blob: new Blob([cuesCsv(s, (x) => fmtTc(x, s.fps))], { type: "text/csv" }), name: `${project?.name ?? (s.name || "show-call")} - cues.csv` }) : undefined}
      />

      {/* the clock */}
      <section className="sc-clock auth-form">
        <div className="sc-tc">
          <span ref={statusRef} className="sc-dot" data-state="idle" aria-hidden="true" />
          <span ref={tcRef} className="num">
            {fmtTc(0, s.fps)}
          </span>
          <span className="muted small">{s.fps === 29.97 ? "29.97 DF" : `${s.fps} fps`}</span>
        </div>
        <div className="sc-song-now">
          <button type="button" className="btn sm" aria-label={t.prevSong} disabled={s.songs[0]?.id === song?.id} onClick={() => set({ current: s.songs[s.songs.findIndex((x) => x.id === song?.id) - 1]?.id ?? s.current })}>
            ◀
          </button>
          <div>
            <p className="eyebrow muted">{t.playing}</p>
            <strong>{song?.name}</strong>
          </div>
          <button type="button" className="btn sm" aria-label={t.nextSong} disabled={s.songs[s.songs.length - 1]?.id === song?.id} onClick={() => set({ current: s.songs[s.songs.findIndex((x) => x.id === song?.id) + 1]?.id ?? s.current })}>
            ▶
          </button>
        </div>
        <div className="sc-next">
          {next ? (
            <>
              <p className="eyebrow muted">{t.next}</p>
              <strong>
                <span className="swatch" style={{ background: deptOf(next)?.color ?? "#888" }} /> {next.label || next.text}
              </strong>
              <span className="num">−{untilText(next.t - now)}</span>
            </>
          ) : (
            <p className="muted small">{t.noNext}</p>
          )}
        </div>
        <div className="sc-arm">
          <button type="button" className={armed ? "btn sc-armed" : "btn"} aria-pressed={armed} onClick={() => setArmed((a) => !a)}>
            {armed ? `🔊 ${t.armed}` : `🔇 ${t.disarmed}`}
          </button>
          <button type="button" className="link small" onClick={hush}>
            {t.hush}
          </button>
        </div>
      </section>

      <div className="sc-grid">
        <aside className="auth-form sc-side">
          <h2>⏱ {t.source}</h2>
          <div className="seg seg3 sc-seg" role="radiogroup" aria-label={t.source}>
            {(["internal", "ltc", "mtc"] as Source[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={source === k} className={source === k ? "on" : undefined} onClick={() => pickSource(k, "", 0)}>
                {t.sources[k]}
              </button>
            ))}
          </div>
          <p className="muted small">{t.sourceHints[source]}</p>
          {/* works even where the microphone isn't allowed */}
          <button type="button" className="link small sc-test" onClick={() => pickSource("ltc", "", 0, true)}>
            {t.testLtc}
          </button>
          {source === "internal" && (
            <div className="sc-transport">
              <button type="button" className="btn sm primary" onClick={() => (running ? clock.pause() : clock.play())}>
                {running ? `⏸ ${t.pause}` : `▶ ${t.play}`}
              </button>
              <button type="button" className="btn sm" onClick={() => clock.locate(Math.max(0, clock.now() - 5))}>
                −5 s
              </button>
              <button type="button" className="btn sm" onClick={() => clock.locate(clock.now() + 5)}>
                +5 s
              </button>
              <input
                className="num"
                placeholder="01:00:00:00"
                aria-label={t.locate}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const v = parseTc(e.currentTarget.value, s.fps);
                  if (v != null) clock.locate(v);
                }}
              />
            </div>
          )}
          {source !== "internal" && (
            <>
              <label className="field">
                <span>{source === "ltc" ? t.audioIn : t.midiIn}</span>
                <select
                  value={inputId}
                  onChange={(e) => {
                    setInputId(e.target.value);
                    pickSource(source, e.target.value, channel);
                  }}
                >
                  <option value="">{t.defaultInput}</option>
                  {inputs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              {source === "ltc" && (
                <label className="field">
                  <span>{t.channel}</span>
                  <select
                    value={channel}
                    onChange={(e) => {
                      setChannel(Number(e.target.value));
                      pickSource("ltc", inputId, Number(e.target.value));
                    }}
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                      <option key={c} value={c}>
                        {fmt(t.channelN, { n: c + 1 })}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="sc-meter" aria-label={t.level}>
                <span ref={meterRef} />
              </div>
              {clock.detected && (
                <p className={Math.abs(clock.detected.fps - s.fps) > 0.6 || clock.detected.dropFrame !== (s.fps === 29.97) ? "auth-err small" : "muted small"}>
                  {fmt(t.detected, { fps: clock.detected.dropFrame ? "29.97 DF" : clock.detected.fps })}
                </p>
              )}
            </>
          )}
          {msg && <p className={msg.ok ? "tf-ok small" : "auth-err small"}>{msg.text}</p>}
          {busy && <p className="muted small">{busy}</p>}

          <h2>🎵 {t.songs}</h2>
          <p className="muted small">{t.songsHint}</p>
          <ol className="sc-songs">
            {s.songs.map((x, i) => {
              const count = s.cues.filter((c) => c.song === x.id).length;
              return (
                <li key={x.id} className={x.id === song?.id ? "on" : undefined}>
                  <button type="button" className="sc-song" onClick={() => set({ current: x.id })}>
                    <span className="num muted">{i + 1}</span> {x.name} <span className="muted small">· {plural(count, t.cues)}</span>
                  </button>
                  <button
                    type="button"
                    className="link small"
                    aria-label={t.rename}
                    onClick={() => {
                      const n = window.prompt(t.rename, x.name)?.trim();
                      if (n) set({ songs: s.songs.map((y) => (y.id === x.id ? { ...y, name: n } : y)) });
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="link small"
                    aria-label={t.remove}
                    disabled={s.songs.length < 2}
                    onClick={() => {
                      if (count && !window.confirm(fmt(t.confirmSong, { name: x.name, n: count }))) return;
                      const songs = s.songs.filter((y) => y.id !== x.id);
                      set({ songs, cues: s.cues.filter((c) => c.song !== x.id), current: x.id === s.current ? songs[0].id : s.current });
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="inv-actions">
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                const name = window.prompt(t.songName, `${t.songWord} ${s.songs.length + 1}`)?.trim();
                if (!name) return;
                const id = newId();
                set({ songs: [...s.songs, { id, name }], current: id });
              }}
            >
              + {t.addSong}
            </button>
            <button type="button" className="btn sm" disabled={!!busy} onClick={() => setListRef.current?.click()}>
              📄 {t.setList}
            </button>
          </div>
          <input
            ref={setListRef}
            type="file"
            hidden
            accept=".pdf,.txt,image/*,application/pdf,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) readSetList(f);
            }}
          />
        </aside>

        <section className="sc-main">
          {/* timeline of the song playing */}
          <div className="auth-form sc-timeline-box">
            <div className="sc-tl-head">
              <strong>{song?.name}</strong>
              <div className="seg sc-seg" role="radiogroup" aria-label={t.zoom}>
                {ZOOMS.map((z) => (
                  <button key={z} type="button" role="radio" aria-checked={zoom === z} className={zoom === z ? "on" : undefined} onClick={() => setZoom(z)}>
                    {z < 60 ? `${z} s` : `${z / 60} min`}
                  </button>
                ))}
              </div>
              <button type="button" className="btn sm primary" onClick={markCue} title={t.markKey}>
                ＋ {t.mark} <kbd>M</kbd>
              </button>
            </div>
            <div className="sc-lanes">
              <div className="sc-lane sc-ruler">
                <span className="sc-lane-name" />
                <div className="sc-track">
                  {Array.from({ length: 11 }, (_, i) => {
                    const step = zoom / 10;
                    const at = Math.ceil(win.from / step) * step + i * step;
                    return (
                      <span key={i} className="sc-tick" style={{ left: `${xOf(at)}%` }}>
                        {fmtTc(at, s.fps).slice(3, 8)}
                      </span>
                    );
                  })}
                  <span className="sc-head" style={{ left: "20%" }} />
                </div>
              </div>
              {lanes.map((lane) => (
                <div key={lane.id ?? "none"} className={lane.muted ? "sc-lane muted" : "sc-lane"}>
                  <span className="sc-lane-name" style={{ borderColor: lane.color }}>
                    {lane.id && (
                      <button type="button" className="sc-mute" aria-pressed={!!lane.muted} title={lane.muted ? t.unmute : t.mute} onClick={() => muteDept(lane.id!)}>
                        {lane.muted ? "🔇" : "🔊"}
                      </button>
                    )}
                    {lane.name}
                  </span>
                  <div
                    className="sc-track"
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest(".sc-marker")) return;
                      if (clock.source === "internal") clock.locate(timeAt(e, e.currentTarget));
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d) return;
                      const v = Math.max(0, Math.round(timeAt(e, e.currentTarget) * realFrames(s.fps)) / realFrames(s.fps));
                      setCue(d.id, { t: v });
                    }}
                    onPointerUp={() => (drag.current = null)}
                  >
                    {cues
                      .filter((c) => (s.depts.some((d) => d.id === c.dept) ? c.dept : null) === lane.id)
                      .map((c) => {
                        const x = xOf(c.t);
                        if (x < -5 || x > 105) return null;
                        const sb = c.kind === "go" && !c.text.trim() ? (c.standby ?? s.standby) : 0;
                        return (
                          <div key={c.id}>
                            {sb > 0 && <span className="sc-sb" style={{ left: `${xOf(c.t - sb)}%`, width: `${(sb / win.len) * 100}%`, background: lane.color }} />}
                            <button
                              type="button"
                              className={["sc-marker", c.id === selected ? "on" : "", fired?.id === c.id ? "fired" : "", c.off ? "off" : ""].join(" ")}
                              style={{ left: `${x}%`, borderColor: lane.color }}
                              title={`${fmtTc(c.t, s.fps)} · ${c.label || c.text}`}
                              onPointerDown={(e) => {
                                setSelected(c.id);
                                drag.current = { id: c.id, el: e.currentTarget };
                                e.currentTarget.closest(".sc-track")?.setPointerCapture(e.pointerId);
                              }}
                            >
                              <span style={{ background: lane.color }} />
                              {c.label || c.text}
                            </button>
                          </div>
                        );
                      })}
                    <span className="sc-head" style={{ left: "20%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* the cue list */}
          <div className="auth-form sc-list">
            <div className="sc-list-head">
              <h2>{fmt(t.cueList, { song: song?.name ?? "" })}</h2>
              <button type="button" className="btn sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                ⬆ {t.importCues}
              </button>
              <input
                ref={fileRef}
                type="file"
                hidden
                multiple
                accept=".xml,.csv,.tsv,.txt,.xlsx,text/xml,application/xml,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  importCues(files);
                }}
              />
            </div>
            {ma3 && (
              <div className="sc-ma3">
                <strong>{fmt(t.ma3Title, { n: ma3.songs.length })}</strong>
                <p className="muted small">{t.ma3Hint}</p>
                <div className="sc-ma3-opts">
                  {(["cue", "hit", "onoff"] as Ma3Kind[]).map((k) => (
                    <label key={k} className="pat-check small">
                      <input type="checkbox" checked={ma3.pick.kinds.includes(k)} onChange={(e) => setPick({ kinds: e.target.checked ? [...ma3.pick.kinds, k] : ma3.pick.kinds.filter((x) => x !== k) })} />
                      {t.ma3Kinds[k]}
                    </label>
                  ))}
                  <label className="field sc-merge">
                    <span>{t.ma3Merge}</span>
                    <input type="number" min={0} max={10} step={0.5} value={ma3.pick.merge} onChange={(e) => setPick({ merge: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
                  </label>
                </div>
                <div className="sc-ma3-songs">
                  {ma3.songs.map((m) => (
                    <details key={m.name}>
                      <summary>
                        {m.name} <span className="muted small">· {plural(ma3Cues(m, ma3.pick, "", s.depts).length, t.cues)}</span>
                      </summary>
                      {m.tracks.map((tr) => (
                        <label key={tr.key} className="pat-check small">
                          <input
                            type="checkbox"
                            checked={ma3.pick.tracks.includes(tr.key)}
                            onChange={(e) => setPick({ tracks: e.target.checked ? [...ma3.pick.tracks, tr.key] : ma3.pick.tracks.filter((k) => k !== tr.key) })}
                          />
                          {tr.master ? "★ " : ""}
                          {tr.name}
                          <span className="muted small">
                            {tr.group ? ` · ${tr.group}` : ""} · {tr.events.filter((e) => ma3.pick.kinds.includes(e.kind)).length}
                          </span>
                        </label>
                      ))}
                    </details>
                  ))}
                </div>
                <div className="inv-actions">
                  <button type="button" className="btn sm primary" disabled={!ma3Count} onClick={finishMa3}>
                    {fmt(t.ma3Import, { n: ma3Count })}
                  </button>
                  <button type="button" className="link small" onClick={() => setMa3(null)}>
                    {t.cancel}
                  </button>
                </div>
              </div>
            )}
            <p className="muted small">{t.importHint}</p>
            {!cues.length && (
              <details open>
                <summary>{t.pasteCues}</summary>
                <textarea className="lab-paste" rows={4} placeholder={t.pastePlaceholder} value={paste} onChange={(e) => setPaste(e.target.value)} />
                <button
                  type="button"
                  className="btn sm"
                  disabled={!paste.trim() || !song}
                  onClick={() => {
                    const found = cuesFromRows(parseTable(paste), s, song!.id);
                    if (!found.length) return setMsg({ ok: false, text: t.errImport });
                    setS((x) => ({ ...x, cues: [...x.cues, ...found] }));
                    setPaste("");
                  }}
                >
                  {t.usePaste}
                </button>
              </details>
            )}
            <div className="sc-rows">
              {cues.map((c) => {
                const isNext = next?.id === c.id;
                return (
                  <div key={c.id} className={["sc-row", c.id === selected ? "on" : "", isNext ? "next" : "", c.off ? "off" : ""].join(" ")} onClick={() => setSelected(c.id)}>
                    <span className="swatch" style={{ background: deptOf(c)?.color ?? "#888" }} />
                    <input
                      key={`${c.id}-${c.t}-${s.fps}`}
                      className="num sc-time"
                      defaultValue={fmtTc(c.t, s.fps)}
                      aria-label={t.time}
                      onBlur={(e) => {
                        const v = parseTc(e.target.value, s.fps);
                        if (v != null && v !== c.t) setCue(c.id, { t: v });
                        else e.target.value = fmtTc(c.t, s.fps);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />
                    <select value={c.dept ?? ""} aria-label={t.dept} onChange={(e) => setCue(c.id, { dept: e.target.value || null })}>
                      <option value="">—</option>
                      {s.depts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select value={c.kind} aria-label={t.kind} onChange={(e) => setCue(c.id, { kind: e.target.value as Cue["kind"] })}>
                      <option value="go">GO</option>
                      <option value="say">{t.note}</option>
                    </select>
                    <input value={c.label} placeholder={t.label} aria-label={t.label} onChange={(e) => setCue(c.id, { label: e.target.value })} />
                    <input value={c.text} placeholder={c.kind === "go" ? t.notePlaceholder : t.sayPlaceholder} aria-label={t.note} onChange={(e) => setCue(c.id, { text: e.target.value })} />
                    <button type="button" className="link small" aria-label={t.preview} title={t.preview} onClick={() => preview(c)}>
                      🔊
                    </button>
                    <button type="button" className="link small" aria-label={t.remove} onClick={() => set({ cues: s.cues.filter((x) => x.id !== c.id) })}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* the cue selected: its standby, what's said, and each language */}
          {sel && (
            <div className="auth-form sc-detail">
              <h2>
                {sel.label || t.cueWord} <span className="muted small num">{fmtTc(sel.t, s.fps)}</span>
              </h2>
              <div className="sc-detail-grid">
                <label className="field">
                  <span>{t.standbySec}</span>
                  <input type="number" min={0} max={120} value={sel.standby ?? ""} placeholder={String(s.standby)} onChange={(e) => setCue(sel.id, { standby: e.target.value === "" ? null : Math.max(0, Math.min(120, Number(e.target.value))) })} />
                </label>
                <label className="pat-check small">
                  <input type="checkbox" checked={!!sel.off} onChange={(e) => setCue(sel.id, { off: e.target.checked })} />
                  {t.cueOff}
                </label>
              </div>
              <ul className="sc-lines">
                {linesOf(s, sel).map((line) => (
                  <li key={line.role}>
                    <span className="muted small num">
                      {fmtTc(line.at, s.fps)} · {t.roles[line.role]}
                    </span>
                    <strong>{line.text}</strong>
                    {line.role !== "go" &&
                      langsFor(s, sel)
                        .filter((l) => l !== s.lang)
                        .map((l) => (
                          <label key={l} className="sc-tr">
                            <span className="muted small">{l.toUpperCase()}</span>
                            <input
                              value={sel.tr?.[l]?.[line.text] ?? ""}
                              placeholder={t.trPlaceholder}
                              onChange={(e) => setCue(sel.id, { tr: { ...(sel.tr ?? {}), [l]: { ...(sel.tr?.[l] ?? {}), [line.text]: e.target.value } } })}
                            />
                          </label>
                        ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* how it's called */}
          <details className="auth-form sc-settings">
            <summary>⚙️ {t.settings}</summary>
            <div className="sc-settings-grid">
              <label className="field">
                <span>{t.fps}</span>
                <select value={s.fps} onChange={(e) => set({ fps: Number(e.target.value) as Fps })}>
                  {FPS_LIST.map((f) => (
                    <option key={f} value={f}>
                      {f === 29.97 ? "29.97 DF" : `${f} fps`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t.writtenIn}</span>
                <select value={s.lang} onChange={(e) => set({ lang: e.target.value })}>
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t.standbySec}</span>
                <input type="number" min={0} max={120} value={s.standby} onChange={(e) => set({ standby: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} />
              </label>
              <label className="field">
                <span>{t.callAhead}</span>
                <input type="number" min={0} max={5} step={0.1} value={s.callAhead} onChange={(e) => set({ callAhead: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })} />
              </label>
              <label className="field">
                <span>{t.standbyWord}</span>
                <input value={s.standbyWord} onChange={(e) => set({ standbyWord: e.target.value })} />
              </label>
              <label className="field">
                <span>{t.goWord}</span>
                <input value={s.goWord} onChange={(e) => set({ goWord: e.target.value })} />
              </label>
              <label className="field">
                <span>{fmt(t.rate, { n: s.rate.toFixed(1) })}</span>
                <input type="range" min={0.6} max={1.6} step={0.1} value={s.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
              </label>
              <div className="sc-checks">
                <label className="pat-check small">
                  <input type="checkbox" checked={s.sayDept} onChange={(e) => set({ sayDept: e.target.checked })} />
                  {t.sayDept}
                </label>
                <label className="pat-check small">
                  <input type="checkbox" checked={s.beep} onChange={(e) => set({ beep: e.target.checked })} />
                  {t.beep}
                </label>
              </div>
            </div>

            <h3>🌐 {t.spoken}</h3>
            <p className="muted small">{t.spokenHint}</p>
            <div className="sc-langs">
              {LANGS.map((l) => (
                <label key={l.code} className="pat-check small">
                  <input
                    type="checkbox"
                    checked={s.langs.includes(l.code)}
                    onChange={(e) => set({ langs: e.target.checked ? [...s.langs, l.code] : s.langs.filter((x) => x !== l.code) })}
                  />
                  {l.name}
                </label>
              ))}
            </div>
            {needed.length > 0 && (
              <div className="inv-actions">
                <button type="button" className="btn sm primary" disabled={!!busy || !s.cues.length} onClick={translateAll}>
                  🌐 {t.translate}
                </button>
                {!canTranslate() && <span className="muted small">{t.errNoTranslator}</span>}
              </div>
            )}
            <div className="sc-voices">
              {[...new Set([s.lang, ...s.langs, ...s.depts.flatMap((d) => d.langs)])].map((l) => (
                <label key={l} className="field">
                  <span>{fmt(t.voiceFor, { lang: LANGS.find((x) => x.code === l)?.name ?? l })}</span>
                  <select value={s.voices[l] ?? ""} onChange={(e) => set({ voices: { ...s.voices, [l]: e.target.value } })}>
                    <option value="">{t.autoVoice}</option>
                    {voicesFor(l).map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" className="btn sm" onClick={() => speak(`${s.standbyWord} ${t.testLine}`, s.lang, { voice: s.voices[s.lang], rate: s.rate })}>
              🔊 {t.testVoice}
            </button>
            <p className="muted small">{t.outputHint}</p>

            <h3>🎧 {t.depts}</h3>
            <p className="muted small">{t.deptsHint}</p>
            {s.depts.map((d) => (
              <div key={d.id} className="sc-dept">
                <input type="color" className="swatch-pick" value={d.color} aria-label={d.name} onChange={(e) => set({ depts: s.depts.map((x) => (x.id === d.id ? { ...x, color: e.target.value } : x)) })} />
                <input value={d.name} aria-label={t.deptName} onChange={(e) => set({ depts: s.depts.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)) })} />
                <select
                  value={d.langs[0] ?? ""}
                  aria-label={t.deptLang}
                  onChange={(e) => set({ depts: s.depts.map((x) => (x.id === d.id ? { ...x, langs: e.target.value ? [e.target.value] : [] } : x)) })}
                >
                  <option value="">{t.showLangs}</option>
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="link small" aria-label={t.remove} onClick={() => set({ depts: s.depts.filter((x) => x.id !== d.id), cues: s.cues.map((c) => (c.dept === d.id ? { ...c, dept: null } : c)) })}>
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn sm"
              onClick={() => set({ depts: [...s.depts, { id: newId(), name: `${t.deptWord} ${s.depts.length + 1}`, color: DEPT_COLORS[s.depts.length % DEPT_COLORS.length], langs: [] }] })}
            >
              + {t.addDept}
            </button>
          </details>
        </section>
      </div>
    </div>
  );
}

const realFrames = (fps: Fps) => (fps === 29.97 ? 30000 / 1001 : fps);

/** How long until a cue: 8.4 s, 2:05, 1:02:05. */
function untilText(sec: number) {
  const v = Math.max(0, sec);
  if (v < 60) return `${v.toFixed(1)} s`;
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const ss = String(Math.floor(v % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
