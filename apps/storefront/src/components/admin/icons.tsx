export type Shape =
  | 'circle'
  | 'check-circle'
  | 'half-circle'
  | 'slash-circle'
  | 'return'
  | 'square'
  | 'half-square'
  | 'check-square'
  | 'octagon-x'
  | 'triangle'
  | 'info'
  | 'check';

/** Inline status shapes (decorative; the word next to them is the accessible name). */
export function Icon({ shape, size = 12 }: { shape: Shape; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };
  switch (shape) {
    case 'circle':
      return <svg {...common}><circle cx="8" cy="8" r="6" /></svg>;
    case 'check-circle':
      return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M5 8l2 2 4-4" /></svg>;
    case 'half-circle':
      return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>;
    case 'slash-circle':
      return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M4 12L12 4" /></svg>;
    case 'return':
      return <svg {...common}><path d="M6 3L3 6l3 3M3 6h6a4 4 0 0 1 0 8H7" /></svg>;
    case 'square':
      return <svg {...common}><rect x="3" y="3" width="10" height="10" rx="1" /></svg>;
    case 'half-square':
      return <svg {...common}><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M8 3h5v10H8z" fill="currentColor" /></svg>;
    case 'check-square':
      return <svg {...common}><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M5.5 8l2 2 3-3.5" /></svg>;
    case 'octagon-x':
      return <svg {...common}><path d="M5 2h6l3 3v6l-3 3H5l-3-3V5z" /><path d="M6 6l4 4M10 6l-4 4" /></svg>;
    case 'triangle':
      return <svg {...common}><path d="M8 2l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.5v.01" /></svg>;
    case 'info':
      return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 7.5v3.5M8 5v.01" /></svg>;
    case 'check':
      return <svg {...common}><path d="M3 8.5l3.5 3.5L13 4.5" /></svg>;
  }
}
