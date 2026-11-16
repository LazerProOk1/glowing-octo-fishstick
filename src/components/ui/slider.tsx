import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-zinc-200">
      <SliderPrimitive.Range className="absolute h-full bg-zinc-900" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-3 w-3 rounded-full border border-zinc-300 bg-white outline-none hover:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));

Slider.displayName = 'Slider';
