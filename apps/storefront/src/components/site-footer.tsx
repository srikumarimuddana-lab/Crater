export function SiteFooter() {
  return (
    <footer className="on-dark bg-espresso text-ivory">
      <div className="page-gutter grid gap-6 py-12 md:grid-cols-12 md:gap-8">
        <p className="font-display text-2xl tracking-[0.2em] text-ivory uppercase md:col-span-4">Crater</p>
        <p className="text-small max-w-[60ch] text-ivory/85 md:col-span-6 md:col-start-7">
          Preview build. No orders can be placed. Shipping, returns and contact details will be added with verified
          store policies.
        </p>
      </div>
    </footer>
  );
}
