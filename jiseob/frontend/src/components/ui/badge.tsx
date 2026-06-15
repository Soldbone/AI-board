import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        outline: 'border-border bg-background text-foreground',
        destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
        muted: 'border-border bg-muted text-muted-foreground',
        success: 'border-green-700/20 bg-green-50 text-green-700',
        warning: 'border-amber-700/20 bg-amber-50 text-amber-700',
        info: 'border-blue-700/20 bg-blue-50 text-blue-700',
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
