import Link from "next/link";
import type { Dict } from "@/lib/i18n/en";

/** The tools give general calculations only: said on the Tools page and under every tool. */
export function ToolsDisclaimer({ t, compact }: { t: Dict["tools"]; compact?: boolean }) {
  return (
    <aside className={compact ? "tools-disclaimer compact" : "tools-disclaimer"} role="note">
      <strong>⚠ {t.disclaimerTitle}</strong> {t.disclaimer}{" "}
      <Link href="/terms">{t.disclaimerLink}</Link>
    </aside>
  );
}
