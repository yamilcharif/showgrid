"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CAT_ABBR, isAccessory, money } from "@/lib/search";
import { createClient } from "@/lib/supabase/browser";
import type { Category } from "@/lib/types";
import { updateItems, type ItemPatch } from "./actions";
import { useT } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";

export interface OwnItem {
  id: string;
  name: string;
  category: Category;
  custom_category: Category | null;
  quantity_owned: number;
  day_rate: number | null;
  listed: boolean;
  public_price: boolean;
  image_url: string | null;
  photo_url: string | null;
}

const CATEGORIES = Object.keys(CAT_ABBR) as Category[];
type Show = "all" | "listed" | "hidden" | "accessories";

export function GearManager({
  companyId,
  slug,
  initial,
}: {
  companyId: string;
  slug: string;
  initial: OwnItem[];
}) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [show, setShow] = useState<Show>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const T = useT();
  const t = T.gear;

  const catOf = (i: OwnItem) => i.custom_category ?? i.category;
  const q = text.trim().toLowerCase();
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (!q || i.name.toLowerCase().includes(q)) &&
          (cat === "all" || catOf(i) === cat) &&
          (show === "all" ||
            (show === "listed" && i.listed) ||
            (show === "hidden" && !i.listed) ||
            (show === "accessories" &&
              (isAccessory(i.name) || catOf(i) === "Power"))),
      ),
    [items, q, cat, show],
  );
  const hiddenCount = items.filter((i) => !i.listed).length;

  // optimistic: change on screen right away, undo if the save fails
  const save = async (ids: string[], patch: ItemPatch) => {
    const before = items;
    setItems((list) =>
      list.map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)),
    );
    setError("");
    const res = await updateItems(ids, patch);
    if (res.error) {
      setItems(before);
      setError(res.error);
    }
  };

  const bulk = async (listed: boolean) => {
    setBusy(true);
    await save(
      shown.filter((i) => i.listed !== listed).map((i) => i.id),
      { listed },
    );
    setBusy(false);
  };

  return (
    <div className="gm">
      <div className="gm-summary">
        <span>
          {fmt(t.shownHidden, { shown: items.length - hiddenCount, hidden: hiddenCount })}
        </span>
        <Link className="btn sm" href={`/c/${slug}`}>
          {t.viewPage}
        </Link>
      </div>

      <div className="gm-tools">
        <input
          type="search"
          className="co-search"
          placeholder={t.search}
          aria-label={t.search}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select
          aria-label={T.results.category}
          value={cat}
          onChange={(e) => setCat(e.target.value as Category | "all")}
        >
          <option value="all">{t.allCategories}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {T.categories[c]}
            </option>
          ))}
        </select>
        <div className="tabchips" role="tablist" aria-label={t.show}>
          {(
            [
              ["all", t.all],
              ["listed", t.shown],
              ["hidden", t.hidden],
              ["accessories", t.accessories],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={show === k}
              className="tabchip"
              onClick={() => setShow(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="gm-bulk">
        <span className="muted small">{fmt(t.inView, { n: shown.length })}</span>
        <button
          type="button"
          className="btn sm"
          disabled={busy || !shown.some((i) => i.listed)}
          onClick={() => bulk(false)}
        >
          {fmt(t.hideAll, { n: shown.length })}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={busy || !shown.some((i) => !i.listed)}
          onClick={() => bulk(true)}
        >
          {fmt(t.showAll, { n: shown.length })}
        </button>
      </div>
      {error && (
        <p className="auth-err" role="alert">
          {error}
        </p>
      )}

      <ul className="gm-list">
        {shown.slice(0, 400).map((i) => (
          <GearRow
            key={i.id}
            i={i}
            companyId={companyId}
            cat={catOf(i)}
            onSave={(patch) => save([i.id], patch)}
            onError={setError}
          />
        ))}
      </ul>
      {shown.length > 400 && (
        <p className="muted small">
          {t.first400}
        </p>
      )}
    </div>
  );
}

interface RowProps {
  i: OwnItem;
  companyId: string;
  cat: Category;
  onSave: (patch: ItemPatch) => Promise<void>;
  onError: (e: string) => void;
}

function GearRow({ i, companyId, cat, onSave, onError }: RowProps) {
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photo = i.photo_url ?? i.image_url;
  const T = useT();
  const t = T.gear;

  const upload = async (f: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type))
      return onError(t.errType);
    if (f.size > 8 * 1024 * 1024)
      return onError(t.errSize);
    setUploading(true);
    const supabase = createClient();
    const ext = f.type.split("/")[1].replace("jpeg", "jpg");
    // storage rules only allow uploads into the owner's own company folder
    const path = `${companyId}/${i.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("gear-photos")
      .upload(path, f, { contentType: f.type, upsert: false });
    if (error) {
      setUploading(false);
      return onError(t.errUpload);
    }
    await onSave({
      photo_url: supabase.storage.from("gear-photos").getPublicUrl(path).data
        .publicUrl,
    });
    setUploading(false);
  };

  return (
    <li className={i.listed ? "gm-row" : "gm-row off"}>
      <button
        type="button"
        className="gm-thumb"
        onClick={() => file.current?.click()}
        aria-label={
          fmt(photo ? t.changePhoto : t.addPhoto, { name: i.name })
        }
      >
        {photo ? (
          <Image src={photo} alt="" fill sizes="64px" />
        ) : (
          <span>{uploading ? "…" : t.photo}</span>
        )}
        {uploading && photo && <span className="gm-busy">…</span>}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
      <div className="gm-main">
        <b>{i.name}</b>
        <span className="muted small num">
          ×{i.quantity_owned}
          {i.day_rate
            ? ` · ${money(Number(i.day_rate))}${T.results.perDay}`
            : t.noPrice}
          {i.photo_url && (
            <>
              {" · "}
              <button
                type="button"
                className="link"
                onClick={() => onSave({ photo_url: null })}
              >
                {t.removePhoto}
              </button>
            </>
          )}
        </span>
      </div>
      <div className="gm-ctrls">
        <select
          aria-label={fmt(t.categoryOf, { name: i.name })}
          value={cat}
          onChange={(e) => {
            const v = e.target.value as Category;
            onSave({ custom_category: v === i.category ? null : v });
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {T.categories[c]}
            </option>
          ))}
        </select>
        <label className="gm-toggle">
          <input
            type="checkbox"
            checked={i.public_price}
            onChange={(e) => onSave({ public_price: e.target.checked })}
          />
          {t.price}
        </label>
        <label className="gm-toggle">
          <input
            type="checkbox"
            checked={i.listed}
            onChange={(e) => onSave({ listed: e.target.checked })}
          />
          {t.shownToggle}
        </label>
      </div>
    </li>
  );
}
