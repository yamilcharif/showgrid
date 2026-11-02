"use client";

import { useRef, useState } from "react";
import { matchPlaces } from "@/lib/places";
import type { Place } from "@/lib/types";
import { PinIcon } from "./icons";

interface Props {
  value: Place;
  onChange: (p: Place) => void;
}

/** Type-ahead for city, country or place. */
export function LocationBox({ value, onChange }: Props) {
  const [text, setText] = useState(value.label);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Place[]>([]);
  const [idx, setIdx] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  const show = (q: string) => {
    const o = matchPlaces(q);
    setOpts(o);
    setIdx(o.length ? 0 : -1);
    setOpen(true);
  };

  const choose = (p: Place) => {
    onChange(p);
    setText(p.label);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) show(text);
      else if (opts.length) setIdx((i) => (i + 1) % opts.length);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      if (opts.length) setIdx((i) => (i - 1 + opts.length) % opts.length);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (idx >= 0) choose(opts[idx]);
    } else if (e.key === "Escape" && open) {
      setOpen(false);
      setText(value.label);
    }
  };

  return (
    <div className="loc">
      <PinIcon />
      <input
        ref={input}
        id="loc"
        role="combobox"
        aria-label="Where"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="locList"
        aria-activedescendant={open && idx >= 0 ? `lo${idx}` : undefined}
        autoComplete="off"
        placeholder="City, country or place"
        value={text}
        onFocus={() => {
          input.current?.select();
          show("");
        }}
        onChange={(e) => {
          setText(e.target.value);
          show(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setText(value.label);
        }}
      />
      <ul id="locList" className="loclist" role="listbox" hidden={!open}>
        {opts.length ? (
          opts.map((o, i) => (
            <li
              key={`${o.label}-${o.country}`}
              id={`lo${i}`}
              role="option"
              data-i={i}
              aria-selected={i === idx}
              // mousedown fires before the input's blur, so the pick isn't lost
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              <span>{o.label}</span>
              <small>{o.sub}</small>
            </li>
          ))
        ) : (
          <li className="none">No match yet. Soon you&apos;ll be able to type any city, venue or address worldwide.</li>
        )}
      </ul>
    </div>
  );
}
