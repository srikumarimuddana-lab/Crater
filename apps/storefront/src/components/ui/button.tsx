import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** `gold`/`outline-light` are for dark (forest/espresso) bands; the others for light surfaces. */
type Variant = 'primary' | 'secondary' | 'gold' | 'outline-light';

const base =
  'inline-flex min-h-13 items-center justify-center gap-2 rounded-xs px-8 text-[0.9375rem] font-semibold ' +
  'uppercase tracking-[0.12em] transition-colors duration-180 motion-reduce:transition-none focus-ring';

const variants: Record<Variant, string> = {
  primary: 'bg-forest text-gold-light hover:bg-forest-hover',
  secondary: 'border border-espresso text-espresso hover:bg-parchment',
  gold: 'bg-gold text-forest-deep hover:bg-gold-light',
  'outline-light': 'border border-gold-light text-ivory hover:bg-forest-hover',
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
