export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-pine/20">
      <div className="page-gutter text-small flex flex-col gap-2 py-10 text-pine-muted md:flex-row md:justify-between">
        <p>
          <span className="font-display text-base tracking-[0.18em] text-pine uppercase">Crater</span> — preview build.
        </p>
        <p>No orders can be placed. Shipping, returns and contact details will be added with verified store policies.</p>
      </div>
    </footer>
  );
}
