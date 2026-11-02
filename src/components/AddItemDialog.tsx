"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createItem, importImage, searchImages, type FoundImage } from "@/app/[lang]/account/gear/actions";
import { guessCategory } from "@/lib/categories";
import { fmt } from "@/lib/i18n/config";
import { CAT_ABBR } from "@/lib/search";
import { createClient } from "@/lib/supabase/browser";
import type { Category } from "@/lib/types";
import { useApp } from "./AppState";
import { useT } from "./I18n";

const CATEGORIES = Object.keys(CAT_ABBR) as Category[];

/** "+" on the owner's page: add an item by hand. A photo is found from the title; the owner can pick another or upload one. */
export function AddItemDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const T = useT();
  const t = T.addItem;
  const router = useRouter();
  const { notify } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Other");
  const [catTouched, setCatTouched] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [found, setFound] = useState<FoundImage[] | null>(null);
  const [searching, setSearching] = useState(false);
  // the chosen photo: a search result (copied into our storage on save) or the owner's own file
  const [picked, setPicked] = useState<FoundImage | null>(null);
  const [own, setOwn] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // look for a photo once the title settles
  useEffect(() => {
    const q = name.trim();
    if (q.length < 3) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await searchImages(q);
      setSearching(false);
      setFound(res);
      setPicked((p) => p ?? res[0] ?? null);
    }, 800);
    return () => clearTimeout(timer);
  }, [name]);

  const onName = (v: string) => {
    setName(v);
    if (!catTouched) setCategory(guessCategory("", v));
  };

  const save = async () => {
    setError("");
    setSaving(true);
    let photoUrl: string | null = null;
    if (own) {
      const ext = own.file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${companyId}/item-${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from("gear-photos").upload(path, own.file, { contentType: own.file.type });
      if (upErr) {
        setSaving(false);
        return setError(T.gear.errUpload);
      }
      photoUrl = supabase.storage.from("gear-photos").getPublicUrl(path).data.publicUrl;
    } else if (picked) {
      const res = await importImage(picked.url);
      // a photo that won't copy isn't worth blocking the item: save it without one
      photoUrl = res.url ?? null;
    }
    const res = await createItem({
      name,
      description,
      category,
      quantity: Number(quantity),
      price: price.trim() === "" ? null : Number(price),
      photoUrl,
    });
    setSaving(false);
    if (res.error) return setError(res.error);
    notify(fmt(t.added, { name: name.trim() }));
    router.refresh();
    onClose();
  };

  const chooseFile = (f: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError(T.gear.errType);
    if (f.size > 8 * 1024 * 1024) return setError(T.gear.errSize);
    setError("");
    setOwn({ file: f, preview: URL.createObjectURL(f) });
  };

  const preview = own?.preview ?? picked?.thumb ?? null;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t.title}>
        <header>
          <h2>{t.title}</h2>
          <button type="button" className="x" aria-label={t.cancel} onClick={onClose}>
            ×
          </button>
        </header>
        <form
          className="dialog-body"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="field">
            <label htmlFor="ai-name">{t.name}</label>
            <input ref={first} id="ai-name" required maxLength={200} placeholder={t.namePlaceholder} value={name} onChange={(e) => onName(e.target.value)} />
          </div>

          <div className="field">
            <span className="lbl">{t.photo}</span>
            <div className="ai-photo">
              <div className="ai-preview">
                {/* search thumbnails come from other sites; the chosen one is copied to our storage on save */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview ? <img src={preview} alt="" /> : <span>{searching ? t.finding : CAT_ABBR[category]}</span>}
              </div>
              <div className="ai-photo-side">
                {found && found.length > 1 && !own && <span className="muted small">{t.pickOther}</span>}
                {found && found.length === 0 && !own && <span className="muted small">{t.noAuto}</span>}
                {found && found.length > 1 && !own && (
                  <div className="ai-thumbs">
                    {found.map((f) => (
                      <button
                        key={f.url}
                        type="button"
                        className={picked?.url === f.url ? "on" : ""}
                        onClick={() => setPicked(f)}
                        aria-label={t.photo}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.thumb} alt="" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="inv-actions">
                  <button type="button" className="btn sm" onClick={() => file.current?.click()}>
                    {t.uploadOwn}
                  </button>
                  {(picked || own) && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setOwn(null);
                        setPicked(null);
                      }}
                    >
                      {t.removePhoto}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) chooseFile(f);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="ai-desc">{t.description}</label>
            <textarea id="ai-desc" className="about-input" rows={2} maxLength={300} placeholder={t.descriptionPlaceholder} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="ai-cat">{t.category}</label>
              <select
                id="ai-cat"
                className="ai-select"
                value={category}
                onChange={(e) => {
                  setCatTouched(true);
                  setCategory(e.target.value as Category);
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {T.categories[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ai-qty">{t.quantity}</label>
              <input id="ai-qty" type="number" min={1} required inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ai-price">{t.price}</label>
            <input id="ai-price" type="number" min={0} step="any" inputMode="decimal" placeholder={t.pricePlaceholder} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          {error && (
            <p className="auth-err" role="alert">
              {error}
            </p>
          )}
          <div className="inv-actions">
            <button className="btn primary" disabled={saving}>
              {saving ? t.saving : t.save}
            </button>
            <button type="button" className="link" onClick={onClose}>
              {t.cancel}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
