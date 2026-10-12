import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Pill buttons (Nuda). `light` and `outline-light` sit on the green bands. */
type Variant = 'primary' | 'secondary' | 'light' | 'outline-light';

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold ' +
  'transition-colors duration-180 motion-reduce:transition-none focus-ring';

const variants: Record<Variant, string> = {
  primary: 'bg-deep text-white hover:bg-deep-hover',
  secondary: 'border border-ink text-ink hover:bg-cream',
  light: 'bg-white text-deep hover:bg-mint',
  'outline-light': 'border border-white/80 text-white hover:bg-white/10',
};

export function buttonClassName(variant: Variant = 'primary', extra = '') {
  return [base, variants[variant], extra].filter(Boolean).join(' ');
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, 'className'> & {
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

/** Navigational action styled as a button. Use <Button> for in-page commands. */
export function ButtonLink({ variant = 'primary', className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClassName(variant, className)} {...props}>
      {children}
    </Link>
  );
}

type ButtonProps = Omit<ComponentProps<'button'>, 'className'> & {
  variant?: Variant;
  className?: string;
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />;
}

export const arrowLinkClassName =
  'link-arrow focus-ring inline-flex min-h-11 items-center gap-1.5 font-semibold text-deep underline decoration-deep/40 underline-offset-4 hover:decoration-deep';

type ArrowLinkProps = Omit<ComponentProps<typeof Link>, 'className'> & { className?: string; tone?: 'light' | 'green'; children: ReactNode };

/** Text link with a trailing arrow ("View all products →"). The arrow is decorative and hidden from the accessible name. */
export function ArrowLink({ className, tone = 'light', children, ...props }: ArrowLinkProps) {
  const cls = tone === 'green' ? arrowLinkClassName.replace('text-deep underline decoration-deep/40 underline-offset-4 hover:decoration-deep', 'text-white underline decoration-white/50 underline-offset-4 hover:decoration-white') : arrowLinkClassName;
  return (
    <Link className={[cls, className].filter(Boolean).join(' ')} {...props}>
      <span>{children}</span>
      <span aria-hidden="true" className="arrow">
        →
      </span>
    </Link>
  );
}
