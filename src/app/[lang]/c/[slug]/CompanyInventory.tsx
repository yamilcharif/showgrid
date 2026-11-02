"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { startConversation } from "@/app/[lang]/messages/actions";
import { useApp } from "@/components/AppState";
import { useT } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";
import { useListings } from "@/components/Listings";
import { useGearList } from "@/components/useGearList";
import type { CompanyPage } from "@/lib/listings";
import { CAT_ABBR, SRC_LABEL, minutesSince, money, syncAgo } from "@/lib/search";
import type { Category, Item } from "@/lib/types";

// headline categories first; cables and small parts at the end
const ORDER: Category[] = ["Lighting", "Audio", "Video", "Rigging", "Effects", "Staging", "Backline", "Power", "Other"];

export function CompanyInventory({ company }: { company: CompanyPage }) {
  const { items, companyById } = useListings();
  const { cart, setCartOpen, notify } = useApp();
  const { add } = useGearList();
  const [cat, setCat] = useState<Category | "all">("all");
  const [text, setText] = useState("");
  const co = companyById(company.id);
  const t = useT();

  const mine = useMemo(
    () =>
      items
        .filter((i) => i.co === company.id)
        // photos first, then the most valuable
        .sort((a, b) => Number(!a.image) - Number(!b.image) || b.rate - a.rate || a.name.localeCompare(b.name)),
    [items, company.id],
  );
  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const i of mine) m.set(i.cat, (m.get(i.cat) ?? 0) + 1);
    return m;
  }, [mine]);
  const units = mine.reduce((n, i) => n + i.total, 0);

  const q = text.trim().toLowerCase();
  const shown = mine.filter((i) => (cat === "all" || i.cat === cat) && (!q || `${i.name} ${i.tags} ${i.spec}`.toLowerCase().includes(q)));
  const sections = ORDER.map((c) => ({ c, list: shown.filter((i) => i.cat === c) })).filter((s) => s.list.length);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: company.name, url });
      else {
        await navigator.clipboard.writeText(url);
        notify(t.company.copied);
      }
    } catch {
      // closing the share sheet isn't an error
    }
  };

  return (
    <>
      <section className="co-hero">
        <div className="wrap">
          <p className="eyebrow">
            <span className="tally" />
            {t.company.eyebrow}
          </p>
          <h1>{company.name}</h1>
          <p className="co-meta">
            {company.city}
            {co && co.src !== "manual" && (
              <>
                {" "}
                · {fmt(t.company.liveFrom, { src: SRC_LABEL[co.src] })}
                {co.syncedAt && <> · {fmt(t.company.updated, { ago: syncAgo(minutesSince(co.syncedAt), t.time) })}</>}
              </>
            )}
          </p>
          {company.about && <p className="co-about">{company.about}</p>}
          <div className="co-stats">
            <div>
              <strong className="num">{mine.length.toLocaleString("en-US")}</strong>{t.company.items}
            </div>
            <div>
              <strong className="num">{units.toLocaleString("en-US")}</strong>{t.company.units}
            </div>
            <div>
              <strong className="num">{counts.size}</strong>{t.company.categories}
            </div>
          </div>
          <div className="co-actions">
            {co && (
              <form action={startConversation}>
                <input type="hidden" name="to" value={co.profileId} />
                <button className="btn primary">{fmt(t.company.message, { name: company.name })}</button>
              </form>
            )}
            <button type="button" className="btn ghost-dark" onClick={share}>
              {t.company.share}
            </button>
          </div>
        </div>
      </section>

      <div className="wrap co-page">
        <div className="co-tools">
          <div className="tabchips" role="tablist" aria-label={t.company.categoryNav}>
            <button type="button" role="tab" aria-selected={cat === "all"} className="tabchip" onClick={() => setCat("all")}>
              {t.company.all} <span className="num">{mine.length}</span>
            </button>
            {ORDER.filter((c) => counts.has(c)).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} className="tabchip" onClick={() => setCat(c)}>
                {t.categories[c]} <span className="num">{counts.get(c)}</span>
              </button>
            ))}
          </div>
          <input
            className="co-search"
            type="search"
            placeholder={fmt(t.company.search, { name: company.name })}
            aria-label={t.company.searchLabel}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {sections.length === 0 && <p className="muted">{t.company.noMatch}</p>}
        {sections.map(({ c, list }) => (
          <section key={c} className="co-section">
            <h2>
              {t.categories[c]} <span className="num muted">{list.length}</span>
            </h2>
            <div className="co-grid">
              {list.map((it) => (
                <GearCard
                  key={it.id}
                  it={it}
                  cur={co?.cur ?? "USD"}
                  inList={cart.find((l) => l.id === it.id)?.qty}
                  onAdd={() => add(it.id)}
                  onOpenList={() => setCartOpen(true)}
                />
              ))}
            </div>
          </section>
        ))}
        <p className="muted small co-note">
          {fmt(t.company.note, { name: company.name })}
        </p>
      </div>
    </>
  );
}

interface CardProps {
  it: Item;
  cur: string;
  inList?: number;
  onAdd: () => void;
  onOpenList: () => void;
}

function GearCard({ it, cur, inList, onAdd, onOpenList }: CardProps) {
  const t = useT();
  return (
    <article className="gcard">
      <div className="gimg">
        {it.image ? (
          <Image src={it.image} alt="" fill sizes="(max-width: 640px) 50vw, 240px" />
        ) : (
          <span className="gph" aria-hidden="true">
            {CAT_ABBR[it.cat]}
          </span>
        )}
      </div>
      <div className="gbody">
        <h3>{it.name}</h3>
        {it.spec && <p className="muted small">{it.spec}</p>}
        <div className="gfoot">
          <span className="num">×{it.total}</span>
          <span className="num">
            {it.pub ? (
              <>
                {money(it.rate, cur)}
                <small>{t.results.perDay}</small>
              </>
            ) : (
              <small className="muted">{t.company.priceOnRequest}</small>
            )}
          </span>
        </div>
        {inList ? (
          <button type="button" className="btn sm" onClick={onOpenList}>
            {fmt(t.results.inList, { n: inList })}
          </button>
        ) : (
          <button type="button" className="btn sm" onClick={onAdd}>
            {t.results.addToList}
          </button>
        )}
      </div>
    </article>
  );
}
