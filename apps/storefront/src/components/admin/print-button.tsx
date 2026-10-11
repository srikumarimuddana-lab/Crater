'use client';

export function PrintButton() {
  return (
    <button type="button" className="a-btn a-noprint" onClick={() => window.print()}>
      Print
    </button>
  );
}
