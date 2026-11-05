/**
 * What kind of gear a name describes, so a rider line can be answered with something similar ("spot for spot").
 * Known models first, then the generic words; the first rule that matches wins, so order matters.
 */
export type GearKind =
  | "followspot" | "hybrid" | "beam" | "wash" | "ellipsoidal" | "spot" | "blinder" | "strobe" | "ledbar" | "par"
  | "lightConsole" | "audioConsole" | "wirelessMic" | "wiredMic" | "hazer" | "fog"
  | "sub" | "lineArray" | "wedge" | "speaker" | "motor" | "truss" | "ledwall" | "projector";

const RULES: [RegExp, GearKind][] = [
  [/follow ?spot|iforte|robospot|lycian|super ?trouper|gladiator|truss ?spot/, "followspot"],
  [/mega ?pointe|\bpointe\b|sharpy ?plus|mythos|axiom|hybrid|spikie/, "hybrid"],
  [/sharpy|\bbeam\b/, "beam"],
  [/wash|\baura\b|spiider|b-?eye|quantum wash|led ?wash/, "wash"],
  [/ellipsoidal|leko|source ?(four|4)\b|\bphx\b|\bers\b/, "ellipsoidal"],
  [/\bspot\b|profile|viper|bmfl|encore|esprite|\bforte\b|\bt1\b|ultra performance|scenius|action ?cs|moving (head|light)/, "spot"],
  [/blinder|molefay|strike ?array/, "blinder"],
  [/strobe|\bjdc|atomic/, "strobe"],
  [/pixel ?(line|bar)|led ?(strip|bar|batten)|strip light|batten/, "ledbar"],
  [/\bpar\b|par ?(56|64)|uplight|colorado/, "par"],
  [/grand ?ma|\bma ?[23]\b|\bhog\b|full ?boar|avolites|tiger ?touch|titan|chamsys|\beos\b|\bion\b|lighting (control )?console/, "lightConsole"],
  [/digico|\bsd ?(5|7|9|10|11|12)\b|yamaha ?(cl|ql|pm)|rivage|s6l|midas|\bpro ?[1-9]\b|\b[mx]32\b|dlive|allen ?& ?heath|\bsq ?[567]\b|foh console|audio console|mixer|mixing (desk|console)/, "audioConsole"],
  [/wireless (mic|microphone|handheld|kit)|axient|\bulx|qlx|\bur-?4|\bew ?(100|300|500)|\bslx/, "wirelessMic"],
  [/\bsm ?5[78]\b|beta ?(52|56|57|58|91|98)|\be ?(604|609|906|935|945)\b|\bmd ?421|\bc ?414|microphone|\bmics?\b/, "wiredMic"],
  [/haze|smaze|\bmdg\b|unique ?2|df-?50/, "hazer"],
  [/\bfog|smoke/, "fog"],
  [/\bsubs?(woofer)?\b|\bks ?28|\bsb ?(18|28)|1-?18/, "sub"],
  [/line ?array|\bk[123]\b|\bkara\b|\bkiva|leopard|\blyon|panther|\bvtx|\bgsl|\bksl/, "lineArray"],
  [/wedge|stage monitor|monitor speaker|\bx15\b|\bm2\b|le ?1200/, "wedge"],
  [/speaker|point ?source|loudspeaker|front ?fill/, "speaker"],
  [/motor|hoist|lodestar|liftket/, "motor"],
  [/truss/, "truss"],
  [/led ?(wall|panel|screen|totem)|video ?wall|\broe\b|absen/, "ledwall"],
  [/projector|barco/, "projector"],
];

// parts and accessories of a kind of gear are not that gear: a haze fan isn't a hazer, a mic stand isn't a mic
const NOT_GEAR = /\b(fan|fluid|cases?|cables?|stands?|floorstand|clamps?|brackets?|rigging|snake|splitters?|nodes?)\b/;

export function gearKind(text: string): GearKind | null {
  const s = text.toLowerCase();
  if (NOT_GEAR.test(s)) return null;
  for (const [re, kind] of RULES) if (re.test(s)) return kind;
  return null;
}

/** What can stand in for each kind, best first. The kind itself always comes first. */
export const STANDS_IN: Record<GearKind, GearKind[]> = {
  followspot: ["followspot"],
  hybrid: ["hybrid", "spot", "beam"],
  beam: ["beam", "hybrid", "spot"],
  spot: ["spot", "hybrid"],
  wash: ["wash"],
  ellipsoidal: ["ellipsoidal"],
  blinder: ["blinder"],
  strobe: ["strobe"],
  ledbar: ["ledbar"],
  par: ["par"],
  lightConsole: ["lightConsole"],
  audioConsole: ["audioConsole"],
  wirelessMic: ["wirelessMic"],
  wiredMic: ["wiredMic"],
  hazer: ["hazer", "fog"],
  fog: ["fog", "hazer"],
  sub: ["sub"],
  lineArray: ["lineArray"],
  wedge: ["wedge"],
  speaker: ["speaker"],
  motor: ["motor"],
  truss: ["truss"],
  ledwall: ["ledwall"],
  projector: ["projector"],
};
