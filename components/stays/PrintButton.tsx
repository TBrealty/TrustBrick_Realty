"use client";

/** Opens the browser's print dialog, where "Save as PDF" downloads the page. */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-dark btn-compact print:hidden">
      <span>{label}</span>
    </button>
  );
}
