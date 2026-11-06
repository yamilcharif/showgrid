/** Airlines a tour usually flies, by IATA code: the code is what fare searches filter on. */
export interface Airline {
  code: string;
  name: string;
}

const RAW = `AA|American Airlines
DL|Delta
UA|United
AS|Alaska Airlines
B6|JetBlue
WN|Southwest
NK|Spirit
F9|Frontier
HA|Hawaiian Airlines
AC|Air Canada
WS|WestJet
AM|Aeroméxico
Y4|Volaris
VB|Viva Aerobus
CM|Copa Airlines
AV|Avianca
LA|LATAM
AR|Aerolíneas Argentinas
G3|GOL
AD|Azul
JA|JetSMART
H2|SKY Airline
P5|Wingo
BA|British Airways
VS|Virgin Atlantic
IB|Iberia
UX|Air Europa
VY|Vueling
AF|Air France
KL|KLM
LH|Lufthansa
LX|SWISS
OS|Austrian
SN|Brussels Airlines
AZ|ITA Airways
TP|TAP Air Portugal
EI|Aer Lingus
SK|SAS
AY|Finnair
TK|Turkish Airlines
FR|Ryanair
U2|easyJet
W6|Wizz Air
EK|Emirates
QR|Qatar Airways
EY|Etihad
JL|Japan Airlines
NH|ANA
KE|Korean Air
SQ|Singapore Airlines
CX|Cathay Pacific
QF|Qantas
NZ|Air New Zealand`;

export const AIRLINES: Airline[] = RAW.split("\n").map((l) => {
  const [code, name] = l.split("|");
  return { code, name };
});

export type AirlineMode = "any" | "only" | "except";

export interface AirlinePrefs {
  mode: AirlineMode;
  /** IATA codes: the ones accepted ("only") or turned down ("except") */
  list: string[];
}

export const ANY_AIRLINE: AirlinePrefs = { mode: "any", list: [] };

/** The codes a search may use: none means any airline. */
export function allowedCodes(p: AirlinePrefs | undefined): string[] {
  if (!p || p.mode === "any" || !p.list.length) return [];
  return p.mode === "only" ? p.list : AIRLINES.map((a) => a.code).filter((c) => !p.list.includes(c));
}

/** The airline a member typed ("Delta", "DL", "delta air lines"), if it's one we know. */
export function findAirline(text: string): Airline | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  return AIRLINES.find((a) => a.code.toLowerCase() === s) ?? AIRLINES.find((a) => s.includes(a.name.toLowerCase()) || a.name.toLowerCase().startsWith(s)) ?? null;
}

/** Whether a typed airline goes against the tour's choice; unknown names aren't judged. */
export function turnedDown(text: string, p: AirlinePrefs | undefined) {
  const a = findAirline(text);
  if (!a || !p || p.mode === "any" || !p.list.length) return false;
  return p.mode === "only" ? !p.list.includes(a.code) : p.list.includes(a.code);
}
