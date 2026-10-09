import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex min-h-13 items-center justify-center gap-2 rounded-xs px-7 text-base font-semibold ' +
  'tracking-[0.01em] transition-colors duration-180 motion-reduce:transition-none focus-ring';

const variants: Record<Variant, string> = {
  primary: 'bg-pine text-porcelain hover:bg-pine-hover',
  secondary: 'border-2 border-pine text-pine hover:bg-mineral',
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
