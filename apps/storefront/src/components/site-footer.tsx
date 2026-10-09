export function SiteFooter() {
  return (
    <footer className="on-dark bg-espresso text-ivory">
      <div className="page-gutter flex flex-col items-center gap-6 py-14 text-center">
        <p className="font-display text-2xl tracking-[0.32em] text-gold-light uppercase">Crater</p>
        <div aria-hidden="true" className="ornament w-40" />
        <p className="text-small max-w-[60ch] text-ivory/90">
          Preview build. No orders can be placed. Shipping, returns and contact details will be added with verified
          store policies.
        </p>
      </div>
    </footer>
  );
}
