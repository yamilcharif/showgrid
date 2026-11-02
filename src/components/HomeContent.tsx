"use client";

import { useApp } from "./AppState";
import { Landing } from "./Landing";
import { Results } from "./Results";

/** The landing page until someone searches (or taps a suggestion), then the results. */
export function HomeContent() {
  const { q } = useApp();
  return q ? <Results /> : <Landing />;
}
