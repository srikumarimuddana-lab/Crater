import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** All surfaces are light now: `primary` is the moss fill, `secondary` a moss outline. */
type Variant = 'primary' | 'secondary';

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 text-base font-medium ' +
  'transition-colors duration-180 motion-reduce:transition-none focus-ring';

const variants: Record<Variant, string> = {
  primary: 'bg-moss text-white hover:bg-moss-hover',
  secondary: 'border border-moss text-moss hover:bg-sage',
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
  'link-arrow focus-ring inline-flex min-h-11 items-center gap-1.5 font-medium text-moss underline decoration-moss/40 underline-offset-4 hover:decoration-moss';

type ArrowLinkProps = Omit<ComponentProps<typeof Link>, 'className'> & { className?: string; children: ReactNode };

/** Text link with a trailing arrow ("View all products →"). The arrow is decorative and hidden from the accessible name. */
export function ArrowLink({ className, children, ...props }: ArrowLinkProps) {
  return (
    <Link className={[arrowLinkClassName, className].filter(Boolean).join(' ')} {...props}>
      <span>{children}</span>
      <span aria-hidden="true" className="arrow">
        →
      </span>
    </Link>
  );
}
