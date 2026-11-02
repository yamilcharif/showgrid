import type { LatLng, Place } from "./types";

// Fixed list for now. Production swaps this for a geocoding service
// (Google Places or Mapbox) so any address, venue or zip code works.

// country code: [name, lat, lng, currency, other names people type]
export const COUNTRIES: Record<string, [string, number, number, string, string]> = {
  US: ["United States", 39.8, -98.6, "USD", "usa us america estados unidos eeuu"],
  CA: ["Canada", 56.1, -106.3, "CAD", ""],
  MX: ["Mexico", 23.6, -102.5, "MXN", "méxico"],
  PR: ["Puerto Rico", 18.2, -66.5, "USD", ""],
  DO: ["Dominican Republic", 18.7, -70.2, "DOP", "republica dominicana rd"],
  PA: ["Panama", 8.5, -80.8, "USD", "panamá"],
  CO: ["Colombia", 4.6, -74.3, "COP", ""],
  PE: ["Peru", -9.2, -75, "PEN", "perú"],
  CL: ["Chile", -35.7, -71.5, "CLP", ""],
  AR: ["Argentina", -38.4, -63.6, "ARS", ""],
  BR: ["Brazil", -14.2, -51.9, "BRL", "brasil"],
  GB: ["United Kingdom", 54, -2, "GBP", "uk england britain great britain scotland wales"],
  IE: ["Ireland", 53.4, -8.2, "EUR", "eire"],
  FR: ["France", 46.2, 2.2, "EUR", "francia"],
  NL: ["Netherlands", 52.1, 5.3, "EUR", "holland holanda"],
  BE: ["Belgium", 50.5, 4.5, "EUR", "belgica"],
  DE: ["Germany", 51.2, 10.4, "EUR", "deutschland alemania"],
  ES: ["Spain", 40.4, -3.7, "EUR", "españa"],
  PT: ["Portugal", 39.4, -8.2, "EUR", ""],
  IT: ["Italy", 41.9, 12.6, "EUR", "italia"],
  CH: ["Switzerland", 46.8, 8.2, "CHF", "suiza schweiz"],
  AT: ["Austria", 47.5, 14.6, "EUR", "österreich"],
  CZ: ["Czechia", 49.8, 15.5, "CZK", "czech republic"],
  PL: ["Poland", 51.9, 19.1, "PLN", "polska"],
  SE: ["Sweden", 60.1, 18.6, "SEK", "sverige"],
  DK: ["Denmark", 56.3, 9.5, "DKK", "danmark"],
  NO: ["Norway", 60.5, 8.5, "NOK", "norge"],
  GR: ["Greece", 39.1, 21.8, "EUR", ""],
  TR: ["Türkiye", 39, 35.2, "TRY", "turkey turquia"],
  AE: ["United Arab Emirates", 23.4, 53.8, "AED", "uae emirates"],
  SA: ["Saudi Arabia", 23.9, 45.1, "SAR", "ksa"],
  QA: ["Qatar", 25.4, 51.2, "QAR", ""],
  IL: ["Israel", 31, 34.9, "ILS", ""],
  EG: ["Egypt", 26.8, 30.8, "EGP", ""],
  NG: ["Nigeria", 9.1, 8.7, "NGN", ""],
  ZA: ["South Africa", -30.6, 22.9, "ZAR", "sa"],
  KE: ["Kenya", -0.02, 37.9, "KES", ""],
  MA: ["Morocco", 31.8, -7.1, "MAD", "marruecos"],
  IN: ["India", 20.6, 79, "INR", ""],
  SG: ["Singapore", 1.35, 103.8, "SGD", ""],
  TH: ["Thailand", 15.9, 101, "THB", ""],
  HK: ["Hong Kong", 22.3, 114.2, "HKD", ""],
  CN: ["China", 35.9, 104.2, "CNY", ""],
  JP: ["Japan", 36.2, 138.3, "JPY", "japon"],
  KR: ["South Korea", 35.9, 127.8, "KRW", "korea"],
  PH: ["Philippines", 12.9, 121.8, "PHP", "filipinas"],
  ID: ["Indonesia", -0.8, 113.9, "IDR", ""],
  AU: ["Australia", -25.3, 133.8, "AUD", ""],
  NZ: ["New Zealand", -40.9, 174.9, "NZD", ""],
};

// [label, lat, lng, country code, other names]
const PLACES: [string, number, number, string, string][] = [
  ["Miami, FL", 25.7617, -80.1918, "US", "south beach brickell"],
  ["Fort Lauderdale, FL", 26.1224, -80.1373, "US", ""],
  ["Orlando, FL", 28.5383, -81.3792, "US", ""],
  ["Tampa, FL", 27.9506, -82.4572, "US", ""],
  ["Atlanta, GA", 33.749, -84.388, "US", ""],
  ["Nashville, TN", 36.1627, -86.7816, "US", ""],
  ["New York, NY", 40.7128, -74.006, "US", "nyc manhattan brooklyn"],
  ["Chicago, IL", 41.8781, -87.6298, "US", ""],
  ["Dallas, TX", 32.7767, -96.797, "US", ""],
  ["Austin, TX", 30.2672, -97.7431, "US", ""],
  ["Houston, TX", 29.7604, -95.3698, "US", ""],
  ["New Orleans, LA", 29.9511, -90.0715, "US", "nola"],
  ["Denver, CO", 39.7392, -104.9903, "US", ""],
  ["Washington, DC", 38.9072, -77.0369, "US", ""],
  ["Las Vegas, NV", 36.1699, -115.1398, "US", "vegas"],
  ["Los Angeles, CA", 34.0522, -118.2437, "US", "la hollywood"],
  ["San Francisco, CA", 37.7749, -122.4194, "US", "sf bay area"],
  ["Toronto, Canada", 43.6532, -79.3832, "CA", ""],
  ["Montreal, Canada", 45.5019, -73.5674, "CA", "montréal"],
  ["Vancouver, Canada", 49.2827, -123.1207, "CA", ""],
  ["Mexico City, Mexico", 19.4326, -99.1332, "MX", "cdmx ciudad de mexico df"],
  ["Guadalajara, Mexico", 20.6597, -103.3496, "MX", ""],
  ["Monterrey, Mexico", 25.6866, -100.3161, "MX", ""],
  ["Cancún, Mexico", 21.1619, -86.8515, "MX", "riviera maya"],
  ["San Juan, Puerto Rico", 18.4655, -66.1057, "PR", ""],
  ["Santo Domingo, Dominican Republic", 18.4861, -69.9312, "DO", ""],
  ["Panama City, Panama", 8.9824, -79.5199, "PA", "ciudad de panama"],
  ["Bogotá, Colombia", 4.711, -74.0721, "CO", ""],
  ["Medellín, Colombia", 6.2442, -75.5812, "CO", ""],
  ["Lima, Peru", -12.0464, -77.0428, "PE", ""],
  ["Santiago, Chile", -33.4489, -70.6693, "CL", ""],
  ["Buenos Aires, Argentina", -34.6037, -58.3816, "AR", "bsas"],
  ["São Paulo, Brazil", -23.5505, -46.6333, "BR", "sp"],
  ["Rio de Janeiro, Brazil", -22.9068, -43.1729, "BR", "rio"],
  ["London, UK", 51.5074, -0.1278, "GB", ""],
  ["Manchester, UK", 53.4808, -2.2426, "GB", ""],
  ["Dublin, Ireland", 53.3498, -6.2603, "IE", ""],
  ["Paris, France", 48.8566, 2.3522, "FR", ""],
  ["Amsterdam, Netherlands", 52.3676, 4.9041, "NL", ""],
  ["Brussels, Belgium", 50.8503, 4.3517, "BE", "bruxelles"],
  ["Berlin, Germany", 52.52, 13.405, "DE", ""],
  ["Munich, Germany", 48.1351, 11.582, "DE", "münchen"],
  ["Cologne, Germany", 50.9375, 6.9603, "DE", "köln"],
  ["Madrid, Spain", 40.4168, -3.7038, "ES", ""],
  ["Barcelona, Spain", 41.3874, 2.1686, "ES", ""],
  ["Ibiza, Spain", 38.9067, 1.4206, "ES", "eivissa"],
  ["Lisbon, Portugal", 38.7223, -9.1393, "PT", "lisboa"],
  ["Milan, Italy", 45.4642, 9.19, "IT", "milano"],
  ["Rome, Italy", 41.9028, 12.4964, "IT", "roma"],
  ["Zurich, Switzerland", 47.3769, 8.5417, "CH", "zürich"],
  ["Vienna, Austria", 48.2082, 16.3738, "AT", "wien"],
  ["Prague, Czechia", 50.0755, 14.4378, "CZ", "praha"],
  ["Warsaw, Poland", 52.2297, 21.0122, "PL", "warszawa"],
  ["Stockholm, Sweden", 59.3293, 18.0686, "SE", ""],
  ["Copenhagen, Denmark", 55.6761, 12.5683, "DK", "københavn"],
  ["Oslo, Norway", 59.9139, 10.7522, "NO", ""],
  ["Athens, Greece", 37.9838, 23.7275, "GR", ""],
  ["Istanbul, Türkiye", 41.0082, 28.9784, "TR", ""],
  ["Dubai, UAE", 25.2048, 55.2708, "AE", ""],
  ["Abu Dhabi, UAE", 24.4539, 54.3773, "AE", ""],
  ["Riyadh, Saudi Arabia", 24.7136, 46.6753, "SA", ""],
  ["Doha, Qatar", 25.2854, 51.531, "QA", ""],
  ["Tel Aviv, Israel", 32.0853, 34.7818, "IL", ""],
  ["Cairo, Egypt", 30.0444, 31.2357, "EG", ""],
  ["Lagos, Nigeria", 6.5244, 3.3792, "NG", ""],
  ["Johannesburg, South Africa", -26.2041, 28.0473, "ZA", "joburg"],
  ["Cape Town, South Africa", -33.9249, 18.4241, "ZA", ""],
  ["Nairobi, Kenya", -1.2921, 36.8219, "KE", ""],
  ["Marrakesh, Morocco", 31.6295, -7.9811, "MA", "marrakech"],
  ["Mumbai, India", 19.076, 72.8777, "IN", "bombay"],
  ["Delhi, India", 28.7041, 77.1025, "IN", "new delhi"],
  ["Singapore", 1.3521, 103.8198, "SG", ""],
  ["Bangkok, Thailand", 13.7563, 100.5018, "TH", ""],
  ["Hong Kong", 22.3193, 114.1694, "HK", ""],
  ["Shanghai, China", 31.2304, 121.4737, "CN", ""],
  ["Tokyo, Japan", 35.6762, 139.6503, "JP", ""],
  ["Seoul, South Korea", 37.5665, 126.978, "KR", ""],
  ["Manila, Philippines", 14.5995, 120.9842, "PH", ""],
  ["Jakarta, Indonesia", -6.2088, 106.8456, "ID", ""],
  ["Sydney, Australia", -33.8688, 151.2093, "AU", ""],
  ["Melbourne, Australia", -37.8136, 144.9631, "AU", ""],
  ["Auckland, New Zealand", -36.8485, 174.7633, "NZ", ""],
];

export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CITIES: Record<string, { ll: LatLng; cc: string }> = {};
for (const p of PLACES) CITIES[p[0]] = { ll: [p[1], p[2]], cc: p[3] };

export const CITY_LABELS = PLACES.map((p) => ({ label: p[0], country: COUNTRIES[p[3]][0] }));

export const PLACE_OPTS: Place[] = [
  ...PLACES.map(([label, lat, lng, cc, aka]) => ({
    label,
    sub: COUNTRIES[cc][0],
    ll: [lat, lng] as LatLng,
    cc,
    country: false,
    hay: fold(`${label} ${COUNTRIES[cc][0]} ${aka}`),
  })),
  ...Object.entries(COUNTRIES).map(([cc, c]) => ({
    label: c[0],
    sub: "Whole country",
    ll: [c[1], c[2]] as LatLng,
    cc,
    country: true,
    hay: fold(`${c[0]} ${c[4]} ${cc}`),
  })),
];

export const DEFAULT_PLACE = PLACE_OPTS.find((o) => o.label === "Miami, FL")!;

export function ccOf(city: string) {
  return CITIES[city]?.cc ?? "US";
}

export function curOf(city: string) {
  return COUNTRIES[ccOf(city)]?.[3] ?? "USD";
}

export function coords(city: string, off?: LatLng): LatLng {
  const c = CITIES[city]?.ll ?? [0, 0];
  return [c[0] + (off?.[0] ?? 0), c[1] + (off?.[1] ?? 0)];
}

const POPULAR = [
  "Miami, FL",
  "New York, NY",
  "Los Angeles, CA",
  "London, UK",
  "Mexico City, Mexico",
  "Madrid, Spain",
  "Dubai, UAE",
  "São Paulo, Brazil",
];

export function matchPlaces(query: string): Place[] {
  const q = fold(query.trim());
  if (!q) return POPULAR.map((l) => PLACE_OPTS.find((o) => o.label === l)!);
  const out: { o: Place; s: number }[] = [];
  for (const o of PLACE_OPTS) {
    const lab = fold(o.label);
    let s = 0;
    if (lab.startsWith(q)) s = 4;
    else if (lab.split(/[\s,]+/).some((w) => w.startsWith(q))) s = 3;
    else if (o.hay.split(/\s+/).some((w) => w.startsWith(q))) s = 2;
    else if (o.hay.includes(q)) s = 1;
    if (s) out.push({ o, s });
  }
  return out
    .sort((a, b) => b.s - a.s || Number(a.o.country) - Number(b.o.country))
    .slice(0, 8)
    .map((x) => x.o);
}
