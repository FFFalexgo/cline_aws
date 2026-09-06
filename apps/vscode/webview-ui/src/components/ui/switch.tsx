import * as SwitchPrimitives from "@radix-ui/react-switch"
import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchSize = "default" | "lg"

const sizeStyles: Record<SwitchSize, { root: string; thumb: string }> = {
	default: {
		root: "h-[18px] w-8",
		thumb: "size-[14px] data-[state=checked]:translate-x-3.5",
	},
	lg: {
		root: "h-5 w-9",
		thumb: "size-[16px] data-[state=checked]:translate-x-4",
	},
}

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
	size?: SwitchSize
}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
	({ className, size = "default", ...props }, ref) => (
		<SwitchPrimitives.Root
			className={cn(
				"peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-button-background data-[state=unchecked]:bg-description",
				sizeStyles[size].root,
				className,
			)}
			{...props}
			ref={ref}>
			<SwitchPrimitives.Thumb
				className={cn(
					"pointer-events-none block rounded-full bg-button-foreground transition-transform duration-150 data-[state=unchecked]:translate-x-0",
					sizeStyles[size].thumb,
				)}
			/>
		</SwitchPrimitives.Root>
	),
)
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
