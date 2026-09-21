import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useId, useState } from "react"
import { CopyButton } from "@/components/common/CopyButton"
import { Button } from "@/components/ui/button"

export function ErrorDetails({ details }: { details: string }) {
	const [expanded, setExpanded] = useState(false)
	const id = useId()
	return (
		<div className="mt-2 min-w-0 rounded-sm border border-editor-group-border bg-code text-foreground">
			<div className="flex items-center justify-between gap-2 px-2 py-1">
				<Button
					aria-controls={id}
					aria-expanded={expanded}
					className="h-auto min-w-0 whitespace-normal text-left text-xs cursor-pointer"
					onClick={() => setExpanded(!expanded)}
					variant="text">
					{expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
					{expanded ? "Hide full error" : "Show full error"}
				</Button>
				<CopyButton ariaLabel="Copy full error" textToCopy={details} />
			</div>
			{expanded && (
				<pre
					aria-label="Full error details"
					className="m-0 max-h-80 overflow-auto whitespace-pre-wrap wrap-anywhere border-t border-editor-group-border p-2 text-xs select-text"
					id={id}
					role="region"
					tabIndex={0}>
					{details}
				</pre>
			)}
		</div>
	)
}
