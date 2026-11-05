import Link from "next/link";

/** On every tool, above the title: back to the Tools page to pick another. */
export function ToolsBack({ label }: { label: string }) {
  return (
    <Link href="/tools" className="tools-back">
      ← {label}
    </Link>
  );
}
