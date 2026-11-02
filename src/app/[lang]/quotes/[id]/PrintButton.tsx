"use client";

/** Opens the browser's print dialog, where "Save as PDF" makes the PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
