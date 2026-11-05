import type { Dict } from "@/lib/i18n/en";
import { fmtWeight, groupSummary, type TruckPlan } from "@/lib/truck";

/** Cases, weight and space per department: on screen and on the printed plan. */
export function GroupTable({ plan, t, metric }: { plan: TruckPlan; t: Dict["truck"]; metric: boolean }) {
  const rows = groupSummary(plan);
  const total = rows.reduce((a, r) => a + r.weight, 0);
  const vol = (cubicIn: number) => (metric ? `${(cubicIn * 1.6387e-5).toFixed(1)} m³` : `${Math.round(cubicIn / 1728)} ft³`);
  return (
    <table className="group-table">
      <caption>{t.summary}</caption>
      <thead>
        <tr>
          <th>{t.groupCol}</th>
          <th>{t.cases}</th>
          <th>{t.weight}</th>
          <th>{t.volUsed}</th>
          <th>{t.colShare}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id || "none"}>
            <td>
              <span className="swatch" style={{ background: r.color }} />
              {r.name || t.groupNone}
            </td>
            <td className="num">
              {r.loaded}
              {r.listed > r.loaded && <span className="muted"> / {r.listed}</span>}
            </td>
            <td className="num">{fmtWeight(r.weight, metric)}</td>
            <td className="num">{vol(r.volume)}</td>
            <td className="num">{total ? Math.round((r.weight / total) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
