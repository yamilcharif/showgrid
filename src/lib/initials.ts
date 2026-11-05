/** "Yamil Charif" → "YC", for avatars without a photo. Plain module so server and client pages can both use it. */
export const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
