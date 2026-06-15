import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border-border bg-background text-foreground hover:bg-accent',
        outline: 'border-border bg-background text-foreground hover:bg-accent',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-accent',
        destructive: 'border-destructive/20 bg-background text-destructive hover:bg-destructive/10',
      },
      size: {
        default: 'px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-9 w-9 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />
  );
}
