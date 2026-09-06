import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xs font-normal leading-normal transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-2 cursor-pointer overflow-hidden",
	{
		variants: {
			variant: {
				default: "bg-button-background text-button-foreground hover:bg-button-hover active:bg-button-hover",
				secondary:
					"bg-button-secondary-background text-button-secondary-foreground hover:bg-button-secondary-background-hover",
				error: "bg-error/10 text-error hover:bg-error/20",
				outline: "border border-editor-group-border bg-transparent text-foreground hover:bg-list-hover",
				"outline-primary": "border border-button-background bg-transparent text-link hover:bg-list-hover",
				ghost: "bg-transparent text-foreground font-normal hover:bg-list-hover",
				link: "text-link underline-offset-4 hover:underline p-0 m-0 select-text hover:text-link-hover",
				text: "text-foreground cursor-text select-text p-0 m-0",
				icon: "bg-transparent text-description hover:bg-list-hover hover:text-foreground p-0 m-0 border-0",
				bedrockCoder: "bg-bedrockCoder border-foreground/20 text-bedrock-coder-foreground",
				success: "bg-success/10 text-success hover:bg-success/20",
				danger: "border border-error/40 bg-error/10 text-error hover:bg-error/20",
			},
			size: {
				default: "min-h-7 py-1 px-2 text-base",
				sm: "min-h-6 py-0.5 px-2 text-sm",
				xs: "min-h-6 min-w-6 px-1.5 py-0.5 text-sm",
				lg: "min-h-10 py-2 px-4 text-base",
				icon: "size-7 p-1",
				header: "min-h-7 py-1 px-2.5 text-sm",
			},
		},
		compoundVariants: [{ variant: ["text", "link"], className: "min-h-0 p-0 font-normal" }],
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
	asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "button"
		return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
	},
)
Button.displayName = "Button"

export { Button }
