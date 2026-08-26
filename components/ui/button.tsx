import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:'bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]',
        secondary:'border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]',
        ghost:'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]',
      },
      size: { default:'h-10 px-4', icon:'h-10 w-10', sm:'h-8 rounded-lg px-3 text-xs' },
    },
    defaultVariants: { variant:'default', size:'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
