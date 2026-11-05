"use client";

import { createPortal } from "react-dom";
import { GroupTable } from "./GroupTable";
import { useI18n } from "@/components/I18n";
import { fmt } from "@/lib/i18n/config";
import { caseNumbers, type Group, fmtLen, fmtWeight, footprint, position, stats, type CaseType, type Placed, type TruckSize } from "@/lib/truck";

export type PrintMode = "plan" | "labels";

interface Props {
  mode: PrintMode;
  truck: TruckSize;
  placed: Placed[];
  types: Map<string, CaseType>;
  metric: boolean;
  /** #1 at the doors (unload order) rather than at the front */
  fromDoors: boolean;
  shot: string | null;
  logo: string | null;
  groups: Group[];
}


/** What gets printed: the plan with its views and load list, or a sheet of case labels. Lives outside the page so only it prints. */
export function TruckPrint({ mode, truck, placed, types, metric, fromDoors, shot, logo, groups }: Props) {
  const { t: T, locale } = useI18n();
  const t = T.truck;
  const num = caseNumbers(placed, types, fromDoors);
  const rows = [...placed].sort((a, b) => num.get(a.uid)! - num.get(b.uid)!);
  const len = (n: number) => fmtLen(n, metric);
  const where = (p: Placed) => {
    const ty = types.get(p.type)!;
    const pos = position(p, ty, truck, placed, types);
    const words = [t.words[pos.zone], t.words[pos.side], pos.level > 1 ? fmt(t.words.stack, { n: pos.level }) : t.words.floor];
    if (pos.tilt === 90) words.push(t.words.tilt90);
    if (pos.tilt === 180) words.push(t.words.tilt180);
    return { pos, words };
  };
  const st = stats(truck, placed, types);
  const date = new Date().toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });

  const body =
    mode === "labels" ? (
      <div className="print-labels">
        {rows.map((p) => {
          const ty = types.get(p.type)!;
          const { pos, words } = where(p);
          return (
            <section key={p.uid} className="case-label" style={{ ["--c" as string]: ty.color }}>
              <div className="cl-band" />
              <div className="cl-body">
                <div className="cl-top">
                  <span className="cl-num">#{num.get(p.uid)}</span>
                  <span className="cl-truck">
                    {fmt(t.feet, { n: truck.key === "custom" ? Math.round(truck.l / 12) : truck.key })}
                  </span>
                </div>
                {groups.find((g) => g.id === ty.group) && <div className="cl-group">{groups.find((g) => g.id === ty.group)!.name}</div>}
                <div className="cl-name">{ty.name}</div>
                <div className="cl-size">
                  {len(ty.l)} × {len(ty.w)} × {len(ty.h)}
                  {ty.wt ? ` · ${fmtWeight(ty.wt, metric)}` : ""}
                </div>
                <div className="cl-words">
                  <strong>{words[0]}</strong>
                  <strong>{words[1]}</strong>
                  <strong className={pos.level > 1 ? "stack" : undefined}>{words[2]}</strong>
                  {words[3] && <strong className="stack">{words[3]}</strong>}
                </div>
                {pos.on && <div className="cl-on">{fmt(t.onCase, { n: num.get(pos.on) ?? "?" })}</div>}
                {/* eslint-disable-next-line @next/next/no-img-element -- the member's logo */}
                {logo && <img className="cl-logo" src={logo} alt="" />}
              </div>
            </section>
          );
        })}
      </div>
    ) : (
      <div className="print-plan">
        <header className="pp-head">
          {/* eslint-disable-next-line @next/next/no-img-element -- the member's logo */}
          {logo && <img className="pp-logo" src={logo} alt="" />}
          <div>
            <h1>
              {t.planTitle} · {fmt(t.feet, { n: truck.key === "custom" ? Math.round(truck.l / 12) : truck.key })}
            </h1>
            <p>
              {t.inside}: {len(truck.l)} × {len(truck.w)} × {len(truck.h)} · {fmt(t.printed, { date })} · show-grid.com
            </p>
          </div>
          <dl>
            <div>
              <dt>{t.totalWeight}</dt>
              <dd>
                {fmtWeight(st.weight, metric)}
                {truck.payload ? ` / ${fmtWeight(truck.payload, metric)}` : ""}
              </dd>
            </div>
            <div>
              <dt>{t.floorUsed}</dt>
              <dd>{Math.round(st.floor * 100)}%</dd>
            </div>
            <div>
              <dt>{t.volUsed}</dt>
              <dd>{Math.round(st.volume * 100)}%</dd>
            </div>
            <div>
              <dt>{t.depth}</dt>
              <dd>{len(st.depth)}</dd>
            </div>
          </dl>
        </header>

        <h2>{t.topView}</h2>
        <TopView truck={truck} placed={placed} types={types} num={num} t={t} />
        <div className="pp-two">
          <div>
            <h2>{t.sideView}</h2>
            <SideView truck={truck} placed={placed} types={types} num={num} />
          </div>
          <div>
            <h2>{t.backView}</h2>
            <BackView truck={truck} placed={placed} types={types} num={num} />
          </div>
        </div>

        <div className="pp-page2">
          {shot && (
            <>
              <h2>{t.view3dPrint}</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- a canvas snapshot, printed as is */}
              <img className="pp-3d" src={shot} alt="" />
            </>
          )}
          {groups.length > 0 && <GroupTable plan={{ truck, types: [...types.values()], placed, metric, groups }} t={t} metric={metric} />}
          <h2>{t.loadList}</h2>
          <p className="pp-note">{fromDoors ? t.loadListNote : t.loadListNoteFront}</p>
          <table className="pp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.caseName}</th>
                <th>
                  {t.length} × {t.width} × {t.height}
                </th>
                <th>{t.weight}</th>
                <th>{t.colWhere}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const ty = types.get(p.type)!;
                const { pos, words } = where(p);
                return (
                  <tr key={p.uid}>
                    <td className="pp-n">
                      <span className="swatch" style={{ background: ty.color }} />
                      {num.get(p.uid)}
                    </td>
                    <td>{ty.name}</td>
                    <td>
                      {len(ty.l)} × {len(ty.w)} × {len(ty.h)}
                    </td>
                    <td>{ty.wt ? fmtWeight(ty.wt, metric) : "–"}</td>
                    <td>
                      {words.join(" · ")}
                      {pos.on ? ` (${fmt(t.onCase, { n: num.get(pos.on) ?? "?" })})` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );

  return createPortal(<div className="print-root">{body}</div>, document.body);
}

type ViewProps = { truck: TruckSize; placed: Placed[]; types: Map<string, CaseType>; num: Map<string, number> };

const label = (n: number | undefined, x: number, y: number, size: number) => (
  <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size }}>
    {n}
  </text>
);

function TopView({ truck, placed, types, num, t }: ViewProps & { t: { front: string; doors: string; driverSide: string; passengerSide: string } }) {
  const m = 16;
  // top of each stack only, so the number you read is the case you see
  const tops = [...placed].sort((a, b) => a.z - b.z);
  return (
    <svg className="pp-view" viewBox={`${-m - 10} ${-m} ${truck.l + m * 2 + 20} ${truck.w + m * 2}`}>
      <rect className="pp-floor" x={0} y={0} width={truck.l} height={truck.w} />
      <text className="pp-lbl" x={truck.l / 2} y={-6} textAnchor="middle">{t.passengerSide}</text>
      <text className="pp-lbl" x={truck.l / 2} y={truck.w + 11} textAnchor="middle">{t.driverSide}</text>
      <text className="pp-lbl" x={-8} y={truck.w / 2} textAnchor="middle" transform={`rotate(-90 -8 ${truck.w / 2})`}>{t.front}</text>
      <text className="pp-lbl" x={truck.l + 12} y={truck.w / 2} textAnchor="middle" transform={`rotate(90 ${truck.l + 12} ${truck.w / 2})`}>{t.doors}</text>
      {tops.map((p) => {
        const f = footprint(p, types.get(p.type)!);
        return (
          <g key={p.uid} className={p.z > 0 ? "pp-case up" : "pp-case"}>
            <rect x={f.x} y={f.y} width={f.l} height={f.w} fill={types.get(p.type)!.color} />
            {label(num.get(p.uid), f.x + f.l / 2, f.y + f.w / 2, Math.min(10, f.w / 2, f.l / 2.2))}
          </g>
        );
      })}
    </svg>
  );
}

/** Seen from the driver side: front of the truck on the left, so x runs left to right and z up. */
function SideView({ truck, placed, types, num }: ViewProps) {
  const m = 6;
  // farthest from the driver side first, so the nearest cases are drawn on top
  const list = [...placed].sort((a, b) => a.y - b.y || a.z - b.z);
  return (
    <svg className="pp-view" viewBox={`${-m} ${-m} ${truck.l + m * 2} ${truck.h + m * 2}`}>
      <rect className="pp-floor" x={0} y={0} width={truck.l} height={truck.h} />
      {truck.bar && <rect className="pp-bar" x={truck.l - truck.bar.from - truck.bar.depth} y={0} width={truck.bar.depth} height={Math.max(0, truck.h - truck.bar.clear)} />}
      {list.map((p) => {
        const f = footprint(p, types.get(p.type)!);
        const y = truck.h - p.z - f.h;
        return (
          <g key={p.uid} className="pp-case">
            <rect x={f.x} y={y} width={f.l} height={f.h} fill={types.get(p.type)!.color} />
            {label(num.get(p.uid), f.x + f.l / 2, y + f.h / 2, Math.min(10, f.h / 2, f.l / 2.2))}
          </g>
        );
      })}
    </svg>
  );
}

/** Seen from the doors, looking in: the driver side is on the left. */
function BackView({ truck, placed, types, num }: ViewProps) {
  const m = 6;
  // front cases first, so the ones nearest the doors are drawn on top
  const list = [...placed].sort((a, b) => a.x - b.x || a.z - b.z);
  return (
    <svg className="pp-view" viewBox={`${-m} ${-m} ${truck.w + m * 2} ${truck.h + m * 2}`}>
      <rect className="pp-floor" x={0} y={0} width={truck.w} height={truck.h} />
      {list.map((p) => {
        const f = footprint(p, types.get(p.type)!);
        const x = truck.w - f.y - f.w;
        const y = truck.h - p.z - f.h;
        return (
          <g key={p.uid} className="pp-case">
            <rect x={x} y={y} width={f.w} height={f.h} fill={types.get(p.type)!.color} />
            {label(num.get(p.uid), x + f.w / 2, y + f.h / 2, Math.min(9, f.h / 2, f.w / 2))}
          </g>
        );
      })}
    </svg>
  );
}
