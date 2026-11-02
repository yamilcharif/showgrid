import type { Category } from "./types";

const CATEGORY_WORDS: [Category, RegExp][] = [
  ["Lighting", /light|licht|lumi|fixture|moving|spot|wash|beam|par\b|led par|follow|dimmer|console.*(ma|grand)|grandma|dmx/i],
  ["Audio", /audio|sound|geluid|speaker|pa\b|line ?array|mic|wireless|console|mixer|desk|amp|monitor|di\b|iem|sub(woofer)?\b|snake/i],
  ["Video", /video|led wall|ledwall|screen|projector|projection|camera|display|tv\b|lcd/i],
  ["Rigging", /rig|truss|motor|hoist|chain|clamp|sling|shackle|steel/i],
  ["Power", /power|stroom|distro|cable|kabel|generator|cee|powercon|socapex|true1|edison|l\d+-\d+/i],
  ["Staging", /stag|podium|riser|deck|barrier|drape|curtain|furniture|lectern/i],
  ["Backline", /backline|drum|guitar|bass|keyboard|piano|instrument/i],
  ["Effects", /effect|haze|fog|smoke|confetti|co2|pyro|flame|spark|bubble/i],
];

/** Most specific first: the item's own folder and name, then the whole folder path. */
export function guessCategory(folderPath: string, name: string): Category {
  const leaf = folderPath.split(" / ").pop() ?? "";
  for (const s of [`${leaf} ${name}`, folderPath]) {
    const hit = CATEGORY_WORDS.find(([, re]) => re.test(s));
    if (hit) return hit[0];
  }
  return "Other";
}

