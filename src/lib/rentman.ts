import "server-only";
import { createAdminClient } from "./supabase/admin";
import { guessCategory } from "./categories";

// Rentman public API v3. Docs: https://api.rentman.net
const API = "https://api.rentman.net";
const PAGE = 1000;
/** how far ahead availability is synced */
export const SYNC_DAYS = 180;

type Row = Record<string, unknown>;

class RentmanError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function get(token: string, path: string, params: Record<string, string> = {}): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = new URL(path, API);
    for (const [k, v] of Object.entries({ ...params, limit: String(PAGE), offset: String(offset) })) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) throw new RentmanError("Rentman didn't accept the API token. Create a new one and save it again.", res.status);
    if (!res.ok) throw new RentmanError(`Rentman returned an error (${res.status}). Try again in a few minutes.`, res.status);
    const body = (await res.json()) as { data?: Row[] };
    const data = body.data ?? [];
    out.push(...data);
    if (data.length < PAGE || out.length > 50_000) return out;
  }
}

/** "/folders/12" → 12 */
const refId = (v: unknown) => (typeof v === "string" ? Number(v.split("/").pop()) : NaN);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

// projects in these states don't hold gear (names as Rentman's default English status names)
const NOT_HOLDING = /cancel|concept|inquiry|returned/i;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface SyncResult {
  items: number;
  bookedDays: number;
}

/** Pull equipment, day rates and bookings from Rentman into ShowGrid for one connection. */
export async function syncRentman(connectionId: string): Promise<SyncResult> {
  const db = createAdminClient();
  const { data: conn } = await db.from("inventory_connections").select("id, company_id, source").eq("id", connectionId).single();
  if (!conn || conn.source !== "rentman") throw new Error("Not a Rentman connection");

  try {
    const { data: token } = await db.rpc("inventory_token", { p_connection: connectionId });
    if (!token) throw new RentmanError("No Rentman token saved.");

    const [equipment, folders, files] = await Promise.all([
      // current_quantity is only returned when asked for by name
      get(token, "/equipment", {
        fields: "id,name,displayname,folder,code,price,type,rental_sales,in_archive,is_physical,shop_description_short,tags,current_quantity,image",
      }),
      get(token, "/folders"),
      // photos: only public files have a URL anyone can open
      get(token, "/files", { fields: "id,url,public,image" }),
    ]);
    const photo = new Map<number, string>();
    for (const f of files) {
      const isPublic = f.public === true || String(f.public).toLowerCase() === "true";
      if (isPublic && f.image && typeof f.url === "string" && f.url.startsWith("https://")) photo.set(num(f.id), f.url);
    }
    const folderName = new Map<number, string>();
    for (const f of folders) folderName.set(num(f.id), String(f.name ?? f.displayname ?? ""));
    const folderPath = (id: number) => {
      const names: string[] = [];
      for (let i = id, n = 0; folderName.has(i) && n < 10; n++) {
        names.unshift(folderName.get(i)!);
        i = refId(folders.find((f) => num(f.id) === i)?.parent);
      }
      return names.join(" / ");
    };

    // physical rental gear only: no sale items, cases, virtual packages or archived items
    const rentable = equipment.filter(
      (e) =>
        !e.in_archive &&
        e.type !== "case" &&
        String(e.rental_sales ?? "rental").toLowerCase() !== "sale" &&
        e.is_physical !== false &&
        String(e.is_physical ?? "").toLowerCase() !== "virtual package",
    );

    const rows = rentable.map((e) => {
      const folder = folderPath(refId(e.folder));
      const name = String(e.displayname || e.name || "").slice(0, 200);
      return {
        company_id: conn.company_id,
        source: "rentman" as const,
        external_id: String(e.id),
        name,
        category: guessCategory(folder, name),
        spec: String(e.shop_description_short || "").slice(0, 300) || null,
        tags: [folder, e.code, e.tags].filter(Boolean).join(" ").slice(0, 500) || null,
        quantity_owned: Math.max(0, Math.round(num(e.current_quantity ?? e.current_quantity_excl_cases))),
        day_rate: num(e.price) || null,
        image_url: photo.get(refId(e.image)) ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    // listed and public_price are the owner's choices, so they're left as they are on update
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("items").upsert(rows.slice(i, i + 500), { onConflict: "company_id,external_id" });
      if (error) throw error;
    }
    // gear deleted or archived in Rentman disappears here too
    const keep = new Set(rows.map((r) => r.external_id));
    const { data: existing } = await db.from("items").select("id, external_id").eq("company_id", conn.company_id).eq("source", "rentman");
    const gone = (existing ?? []).filter((r) => !keep.has(r.external_id ?? "")).map((r) => r.id);
    for (let i = 0; i < gone.length; i += 500) await db.from("items").delete().in("id", gone.slice(i, i + 500));

    // bookings: units of each item planned on projects, per day, for the next SYNC_DAYS
    const today = new Date();
    const until = new Date(today.getTime() + SYNC_DAYS * 864e5);
    const window = { "planperiod_end[gte]": today.toISOString(), "planperiod_start[lte]": until.toISOString() };
    const [planned, groups, subprojects, statuses] = await Promise.all([
      get(token, "/projectequipment", window),
      get(token, "/projectequipmentgroup", { ...window, fields: "id,subproject" }),
      // subprojects can't be filtered by plan period (it's a generated field there)
      get(token, "/subprojects", { fields: "id,status" }),
      get(token, "/statuses"),
    ]);
    // equipment group → subproject → status: skip gear on cancelled, concept, inquiry or returned projects
    const skipStatus = new Set(statuses.filter((s) => NOT_HOLDING.test(String(s.name ?? ""))).map((s) => num(s.id)));
    const skipSub = new Set(subprojects.filter((s) => skipStatus.has(refId(s.status))).map((s) => num(s.id)));
    const skipGroup = new Set(groups.filter((g) => skipSub.has(refId(g.subproject))).map((g) => num(g.id)));
    const { data: idRows } = await db.from("items").select("id, external_id").eq("company_id", conn.company_id).eq("source", "rentman");
    const itemId = new Map((idRows ?? []).map((r) => [r.external_id, r.id]));
    const perDay = new Map<string, number>(); // `${item}|${day}` → units
    for (const p of planned) {
      const id = itemId.get(String(refId(p.equipment)));
      if (!id || !p.planperiod_start || !p.planperiod_end || skipGroup.has(refId(p.equipment_group))) continue;
      // planned units, including options: better to show gear as booked than promise it twice
      const units = num(p.quantity_total ?? p.quantity);
      if (units <= 0) continue;
      const start = new Date(Math.max(new Date(String(p.planperiod_start)).getTime(), today.getTime()));
      const end = new Date(Math.min(new Date(String(p.planperiod_end)).getTime(), until.getTime()));
      for (let d = new Date(isoDay(start) + "T12:00Z"); d <= end; d = new Date(d.getTime() + 864e5)) {
        const key = `${id}|${isoDay(d)}`;
        perDay.set(key, (perDay.get(key) ?? 0) + units);
      }
    }
    const bookings = [...perDay].map(([key, units]) => {
      const [item_id, day] = key.split("|");
      return { item_id, day, quantity_booked: Math.round(units) };
    });
    const ids = [...itemId.values()];
    for (let i = 0; i < ids.length; i += 200) await db.from("item_bookings").delete().in("item_id", ids.slice(i, i + 200));
    for (let i = 0; i < bookings.length; i += 1000) {
      const { error } = await db.from("item_bookings").insert(bookings.slice(i, i + 1000));
      if (error) throw error;
    }

    await db.from("inventory_connections").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", connectionId);
    return { items: rows.length, bookedDays: bookings.length };
  } catch (e) {
    const message = e instanceof RentmanError ? e.message : "The sync failed. Try again in a few minutes.";
    await db.from("inventory_connections").update({ last_error: message }).eq("id", connectionId);
    throw new Error(message, { cause: e });
  }
}
