/** Small maple leaf for the "Proudly Canadian" tag. Decorative; the text carries the meaning. */
export function MapleLeaf({ className = 'size-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.2l1.6 3.1 2.2-.9-.6 3.6 2.6-1.4.4 2.7 3.6-.4-1.8 2.7 2 1.4-3.5 1.7 1 2.4-4.4-.6.3 2.9-3.1-1.6-.3 4.7h-1l-.3-4.7-3.1 1.6.3-2.9-4.4.6 1-2.4L2 13.1l2-1.4-1.8-2.7 3.6.4.4-2.7 2.6 1.4-.6-3.6 2.2.9z" />
    </svg>
  );
}
