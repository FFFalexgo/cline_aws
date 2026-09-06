import { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

type SectionProps = HTMLAttributes<HTMLDivElement>

const Section = ({ className, ...props }: SectionProps) => (
	<div className={cn("flex flex-col gap-3 px-3 py-2", className)} {...props} />
)

export default Section
