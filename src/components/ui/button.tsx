import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
        outline: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50',
        ghost: 'text-zinc-700 hover:bg-zinc-100',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);

Button.displayName = 'Button';
