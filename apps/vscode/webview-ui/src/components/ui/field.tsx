import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-3", className)} {...props} />
}
export function Field({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex min-w-0 flex-col gap-1", className)} {...props} />
}
export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
	return <label className={cn("text-base font-normal leading-normal", className)} {...props} />
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
	return <p className={cn("m-0 text-sm leading-normal text-description", className)} {...props} />
}
