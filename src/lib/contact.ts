/** Public contact details a member can show on their page. */
export interface Contact {
  phone: string | null;
  email?: string | null;
  address?: string | null;
  website: string | null;
  instagram: string | null;
}

/** "example.com" → "https://example.com"; anything that isn't a web address → null. */
export function cleanWebsite(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}

/** "@yc3design", "instagram.com/yc3design/" → "yc3design" */
export function cleanInstagram(v: string): string | null {
  const s = v.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : null;
}

export const cleanEmail = (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().slice(0, 200) : null);
export const cleanPhone = (v: string) => (v.trim() ? v.trim().replace(/[^\d+()\-.\s]/g, "").slice(0, 40) || null : null);

/** A tel: link that works from the typed number. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
/** Opens the address in the visitor's maps app or Google Maps. */
export const mapsHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const websiteLabel = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
