/**
 * Airports for tour routing: the main airport of the cities tours play, with other names people write.
 * "IATA|City|Country|lat|lng|other names, comma separated". Approximate positions, close enough to estimate distances.
 */
const RAW = `ATL|Atlanta|US|33.64|-84.43|
BOS|Boston|US|42.36|-71.01|foxborough
BWI|Baltimore|US|39.18|-76.67|
CLT|Charlotte|US|35.21|-80.94|
ORD|Chicago|US|41.98|-87.90|rosemont
CVG|Cincinnati|US|39.05|-84.66|
CLE|Cleveland|US|41.41|-81.85|
CMH|Columbus|US|40.00|-82.89|
DFW|Dallas|US|32.90|-97.04|fort worth,arlington,irving,frisco
DEN|Denver|US|39.86|-104.67|morrison,red rocks
DTW|Detroit|US|42.21|-83.35|clarkston
FLL|Fort Lauderdale|US|26.07|-80.15|sunrise,hollywood fl
RSW|Fort Myers|US|26.54|-81.76|estero
IAH|Houston|US|29.99|-95.34|the woodlands
IND|Indianapolis|US|39.72|-86.29|noblesville
JAX|Jacksonville|US|30.49|-81.69|
MCI|Kansas City|US|39.30|-94.71|
LAS|Las Vegas|US|36.08|-115.15|paradise
LAX|Los Angeles|US|33.94|-118.41|inglewood,hollywood,anaheim,pasadena,long beach
SDF|Louisville|US|38.17|-85.74|
MEM|Memphis|US|35.04|-89.98|
MIA|Miami|US|25.79|-80.29|miami beach,doral,miami gardens
MKE|Milwaukee|US|42.95|-87.90|
MSP|Minneapolis|US|44.88|-93.22|saint paul,st paul
BNA|Nashville|US|36.12|-86.68|
MSY|New Orleans|US|29.99|-90.26|
JFK|New York|US|40.64|-73.78|nyc,brooklyn,manhattan,queens,bronx
EWR|Newark|US|40.69|-74.17|east rutherford,new jersey
OKC|Oklahoma City|US|35.39|-97.60|
OMA|Omaha|US|41.30|-95.89|
MCO|Orlando|US|28.43|-81.31|
PHL|Philadelphia|US|39.87|-75.24|camden
PHX|Phoenix|US|33.43|-112.01|glendale az,tempe,scottsdale
PIT|Pittsburgh|US|40.49|-80.23|
PDX|Portland|US|45.59|-122.60|
RDU|Raleigh|US|35.88|-78.79|durham
RIC|Richmond|US|37.51|-77.32|
SMF|Sacramento|US|38.70|-121.59|
SLC|Salt Lake City|US|40.79|-111.98|west valley
SAT|San Antonio|US|29.53|-98.47|
SAN|San Diego|US|32.73|-117.19|chula vista
SFO|San Francisco|US|37.62|-122.38|
OAK|Oakland|US|37.72|-122.22|
SJC|San Jose|US|37.36|-121.93|santa clara
SEA|Seattle|US|47.45|-122.31|tacoma
STL|St. Louis|US|38.75|-90.37|saint louis,maryland heights
TPA|Tampa|US|27.98|-82.53|
TUS|Tucson|US|32.12|-110.94|
DCA|Washington|US|38.85|-77.04|washington dc,dc,landover,bristow
ABQ|Albuquerque|US|35.04|-106.61|
AUS|Austin|US|30.19|-97.67|
BHM|Birmingham AL|US|33.56|-86.75|birmingham alabama
BUF|Buffalo|US|42.94|-78.73|
BOI|Boise|US|43.56|-116.22|
HNL|Honolulu|US|21.32|-157.92|
ANC|Anchorage|US|61.17|-150.00|
ELP|El Paso|US|31.81|-106.38|
GRR|Grand Rapids|US|42.88|-85.52|
GSP|Greenville|US|34.90|-82.22|
HSV|Huntsville|US|34.64|-86.77|
LIT|Little Rock|US|34.73|-92.22|
CHS|Charleston|US|32.90|-80.04|
SAV|Savannah|US|32.13|-81.20|
PBI|West Palm Beach|US|26.68|-80.10|
ALB|Albany|US|42.75|-73.80|saratoga
PVD|Providence|US|41.72|-71.43|
BDL|Hartford|US|41.94|-72.68|uncasville
SYR|Syracuse|US|43.11|-76.11|
ROC|Rochester|US|43.12|-77.67|
DSM|Des Moines|US|41.53|-93.66|
TUL|Tulsa|US|36.20|-95.89|
RNO|Reno|US|39.50|-119.77|
SNA|Orange County|US|33.68|-117.87|santa ana,irvine,costa mesa
SJU|San Juan|PR|18.44|-66.00|puerto rico
YYZ|Toronto|CA|43.68|-79.63|
YUL|Montreal|CA|45.47|-73.74|montréal
YVR|Vancouver|CA|49.19|-123.18|
YYC|Calgary|CA|51.13|-114.01|
YEG|Edmonton|CA|53.31|-113.58|
YOW|Ottawa|CA|45.32|-75.67|
YWG|Winnipeg|CA|49.91|-97.24|
YQB|Quebec City|CA|46.79|-71.39|québec,quebec
YHZ|Halifax|CA|44.88|-63.51|
MEX|Mexico City|MX|19.44|-99.07|cdmx,ciudad de mexico,df
GDL|Guadalajara|MX|20.52|-103.31|zapopan
MTY|Monterrey|MX|25.78|-100.11|
CUN|Cancun|MX|21.04|-86.87|cancún,playa del carmen,tulum
TIJ|Tijuana|MX|32.54|-116.97|
PVR|Puerto Vallarta|MX|20.68|-105.25|
QRO|Queretaro|MX|20.62|-100.19|querétaro
PBC|Puebla|MX|19.16|-98.37|
MID|Merida|MX|20.94|-89.66|mérida
PTY|Panama City|PA|9.07|-79.38|panama,ciudad de panama
SJO|San Jose Costa Rica|CR|9.99|-84.21|costa rica,san josé costa rica
GUA|Guatemala City|GT|14.58|-90.53|guatemala,ciudad de guatemala
SAL|San Salvador|SV|13.44|-89.06|el salvador
TGU|Tegucigalpa|HN|14.06|-87.22|
SAP|San Pedro Sula|HN|15.45|-87.92|
MGA|Managua|NI|12.14|-86.17|
SDQ|Santo Domingo|DO|18.43|-69.67|
PUJ|Punta Cana|DO|18.57|-68.36|
STI|Santiago de los Caballeros|DO|19.41|-70.60|santiago rd
HAV|Havana|CU|22.99|-82.41|la habana
KIN|Kingston|JM|17.94|-76.79|
MBJ|Montego Bay|JM|18.50|-77.91|
NAS|Nassau|BS|25.04|-77.47|bahamas
POS|Port of Spain|TT|10.60|-61.34|trinidad
AUA|Aruba|AW|12.50|-70.02|oranjestad
CUR|Curacao|CW|12.19|-68.96|curaçao,willemstad
BOG|Bogota|CO|4.70|-74.15|bogotá
MDE|Medellin|CO|6.16|-75.42|medellín
CLO|Cali|CO|3.54|-76.38|
BAQ|Barranquilla|CO|10.89|-74.78|
CTG|Cartagena|CO|10.44|-75.51|
UIO|Quito|EC|-0.13|-78.36|
GYE|Guayaquil|EC|-2.16|-79.88|
LIM|Lima|PE|-12.02|-77.11|
SCL|Santiago|CL|-33.39|-70.79|santiago de chile
EZE|Buenos Aires|AR|-34.82|-58.54|
COR|Cordoba|AR|-31.32|-64.21|córdoba
MDZ|Mendoza|AR|-32.83|-68.79|
ROS|Rosario|AR|-32.90|-60.79|
MVD|Montevideo|UY|-34.84|-56.03|
ASU|Asuncion|PY|-25.24|-57.52|asunción
VVI|Santa Cruz|BO|-17.64|-63.14|santa cruz de la sierra
LPB|La Paz|BO|-16.51|-68.19|
CCS|Caracas|VE|10.60|-66.99|
GRU|Sao Paulo|BR|-23.43|-46.47|são paulo
GIG|Rio de Janeiro|BR|-22.81|-43.25|rio
BSB|Brasilia|BR|-15.87|-47.92|brasília
CNF|Belo Horizonte|BR|-19.62|-43.97|
POA|Porto Alegre|BR|-29.99|-51.17|
CWB|Curitiba|BR|-25.53|-49.18|
SSA|Salvador|BR|-12.91|-38.33|salvador de bahia
REC|Recife|BR|-8.13|-34.92|
FOR|Fortaleza|BR|-3.78|-38.53|
LHR|London|GB|51.47|-0.45|londres
MAN|Manchester|GB|53.36|-2.27|
BHX|Birmingham|GB|52.45|-1.75|birmingham uk
GLA|Glasgow|GB|55.87|-4.43|
EDI|Edinburgh|GB|55.95|-3.37|
DUB|Dublin|IE|53.42|-6.27|
BFS|Belfast|GB|54.66|-6.22|
CDG|Paris|FR|49.01|2.55|
LYS|Lyon|FR|45.73|5.08|
MRS|Marseille|FR|43.44|5.21|
NCE|Nice|FR|43.66|7.22|
AMS|Amsterdam|NL|52.31|4.76|
BRU|Brussels|BE|50.90|4.48|bruselas,antwerp
FRA|Frankfurt|DE|50.04|8.56|
MUC|Munich|DE|48.35|11.79|münchen
BER|Berlin|DE|52.37|13.50|
HAM|Hamburg|DE|53.63|9.99|
CGN|Cologne|DE|50.87|7.14|köln,koln
DUS|Dusseldorf|DE|51.29|6.77|düsseldorf
STR|Stuttgart|DE|48.69|9.22|
ZRH|Zurich|CH|47.46|8.55|zürich
GVA|Geneva|CH|46.24|6.11|genève,ginebra
VIE|Vienna|AT|48.11|16.57|wien,viena
PRG|Prague|CZ|50.10|14.26|praha,praga
WAW|Warsaw|PL|52.17|20.97|warszawa,varsovia
KRK|Krakow|PL|50.08|19.78|kraków
BUD|Budapest|HU|47.44|19.26|
CPH|Copenhagen|DK|55.62|12.65|københavn,copenhague
ARN|Stockholm|SE|59.65|17.92|estocolmo
OSL|Oslo|NO|60.19|11.10|
HEL|Helsinki|FI|60.32|24.96|
MAD|Madrid|ES|40.47|-3.56|
BCN|Barcelona|ES|41.30|2.08|
VLC|Valencia|ES|39.49|-0.48|
SVQ|Seville|ES|37.42|-5.90|sevilla
AGP|Malaga|ES|36.67|-4.50|málaga,marbella
BIO|Bilbao|ES|43.30|-2.91|
LIS|Lisbon|PT|38.77|-9.13|lisboa
OPO|Porto|PT|41.24|-8.68|oporto
FCO|Rome|IT|41.80|12.25|roma
MXP|Milan|IT|45.63|8.72|milano,milán
BLQ|Bologna|IT|44.53|11.29|
NAP|Naples|IT|40.88|14.29|napoli
VCE|Venice|IT|45.51|12.35|venezia
FLR|Florence|IT|43.81|11.20|firenze
ATH|Athens|GR|37.94|23.94|atenas
IST|Istanbul|TR|41.26|28.74|estambul
OTP|Bucharest|RO|44.57|26.09|bucuresti
SOF|Sofia|BG|42.70|23.41|
BEG|Belgrade|RS|44.82|20.31|beograd
ZAG|Zagreb|HR|45.74|16.07|
DXB|Dubai|AE|25.25|55.36|
AUH|Abu Dhabi|AE|24.43|54.65|
DOH|Doha|QA|25.27|51.61|
RUH|Riyadh|SA|24.96|46.70|
JED|Jeddah|SA|21.68|39.16|
TLV|Tel Aviv|IL|32.01|34.89|
CAI|Cairo|EG|30.12|31.41|
JNB|Johannesburg|ZA|-26.14|28.24|
CPT|Cape Town|ZA|-33.97|18.60|
LOS|Lagos|NG|6.58|3.32|
NBO|Nairobi|KE|-1.32|36.93|
CMN|Casablanca|MA|33.37|-7.59|
DEL|Delhi|IN|28.56|77.10|new delhi
BOM|Mumbai|IN|19.09|72.87|bombay
BLR|Bangalore|IN|13.20|77.71|bengaluru
SIN|Singapore|SG|1.36|103.99|singapur
KUL|Kuala Lumpur|MY|2.75|101.71|
BKK|Bangkok|TH|13.69|100.75|
CGK|Jakarta|ID|-6.13|106.66|
MNL|Manila|PH|14.51|121.02|
HKG|Hong Kong|HK|22.31|113.91|
TPE|Taipei|TW|25.08|121.23|
ICN|Seoul|KR|37.46|126.44|
HND|Tokyo|JP|35.55|139.78|
KIX|Osaka|JP|34.43|135.24|
PEK|Beijing|CN|40.08|116.58|pekin
PVG|Shanghai|CN|31.14|121.81|
CAN|Guangzhou|CN|23.39|113.30|
SYD|Sydney|AU|-33.94|151.18|
MEL|Melbourne|AU|-37.67|144.84|
BNE|Brisbane|AU|-27.38|153.12|
PER|Perth|AU|-31.94|115.97|
ADL|Adelaide|AU|-34.95|138.53|
AKL|Auckland|NZ|-37.01|174.79|`;

export interface Airport {
  code: string;
  city: string;
  cc: string;
  lat: number;
  lng: number;
  /** folded names to match against: city, other names */
  names: string[];
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const AIRPORTS: Airport[] = RAW.split("\n").map((line) => {
  const [code, city, cc, lat, lng, other] = line.split("|");
  return { code, city, cc, lat: Number(lat), lng: Number(lng), names: [fold(city), ...(other ? other.split(",").map(fold) : [])].filter(Boolean) };
});

const byCode = new Map(AIRPORTS.map((a) => [a.code, a]));

/**
 * The airport for a place as people write it in a routing: "MIA", "Miami, FL", "Bogotá", "Hard Rock Stadium – Miami Gardens".
 * An airport code wins; then the longest city name found in the text.
 */
export function findAirport(text: string): Airport | null {
  const raw = text.trim();
  if (!raw) return null;
  const code = raw.match(/\b([A-Z]{3})\b/);
  if (code && byCode.has(code[1])) return byCode.get(code[1])!;
  const t = ` ${fold(raw)} `;
  let best: Airport | null = null;
  let len = 0;
  // the longest name found as whole words wins: "san jose costa rica" over "san jose", "miami gardens" over "miami"
  for (const a of AIRPORTS) for (const n of a.names) if (n.length > len && t.includes(` ${n} `)) [best, len] = [a, n.length];
  return best;
}

/** Great-circle distance in miles. */
export function miles(a: Airport, b: Airport) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}
