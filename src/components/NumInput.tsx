"use client";

import { useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from "react";

/**
 * A number field you can clear and retype. A plain controlled field snaps back to its minimum the moment it is
 * empty (delete the "1" and it comes right back). This one keeps what you type while you are in it, passes every
 * real number on as you type, and only settles an empty field (to its minimum, or blank where blank is allowed)
 * when you leave it.
 */
export function NumInput({ value, onChange, onFocus, onBlur, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [draft, setDraft] = useState<string | null>(null);

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    if (e.target.value.trim() !== "") onChange?.(e);
  };
  const blur = (e: FocusEvent<HTMLInputElement>) => {
    if (draft !== null && draft.trim() === "") onChange?.(e as unknown as ChangeEvent<HTMLInputElement>);
    setDraft(null);
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode ?? (rest.step && Number(rest.step) % 1 !== 0 ? "decimal" : "numeric")}
      value={draft ?? value ?? ""}
      onChange={change}
      onFocus={(e) => {
        setDraft(null);
        onFocus?.(e);
      }}
      onBlur={blur}
    />
  );
}
