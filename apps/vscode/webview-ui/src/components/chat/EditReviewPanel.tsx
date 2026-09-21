import type { EditReviewChange, EditReviewState } from "@shared/EditReview"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileServiceClient } from "@/services/grpc-client"

function lineLocations(change: EditReviewChange): string {
	return change.hunks
		.map((hunk) => {
			const start = Math.max(1, hunk.newLines ? hunk.newStart : hunk.oldStart)
			const count = hunk.newLines || hunk.oldLines
			return `${hunk.newLines ? "" : "Old "}L${start}${count > 1 ? `–${start + count - 1}` : ""}`
		})
		.join(", ")
}

export function EditReviewPanel({ review }: { review?: EditReviewState }) {
	const [busy, setBusy] = useState<string>()
	const [error, setError] = useState<string>()
	if (!review || (!review.changes.length && !review.error)) return null

	const act = async (change: EditReviewChange, action: "diff" | "keep" | "undo") => {
		setBusy(change.id)
		setError(undefined)
		try {
			await FileServiceClient.reviewEdit({ taskId: review.taskId, changeId: change.id, revision: change.revision, action })
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause))
		} finally {
			setBusy(undefined)
		}
	}

	return (
		<section aria-label="File changes" className="shrink-0 border-t border-editor-group-border px-3 py-2 text-sm">
			<details open>
				<summary className="cursor-pointer select-none font-medium">
					{review.changes.length} {review.changes.length === 1 ? "file changed" : "files changed"}
					<span className="text-success ml-2">
						+{review.changes.reduce((count, change) => count + change.additions, 0)}
					</span>
					<span className="text-error ml-1">
						−{review.changes.reduce((count, change) => count + change.deletions, 0)}
					</span>
				</summary>
				<div
					className="grid gap-x-1 overflow-y-auto mt-1"
					style={{
						maxHeight: "24vh",
						gridTemplateColumns: "minmax(0, 1fr) max-content max-content max-content max-content",
					}}>
					{review.changes.map((change) => {
						const locations = lineLocations(change)
						return (
							<div className="col-span-full grid grid-cols-subgrid items-center min-w-0" key={change.id}>
								<button
									aria-label={`Show diff for ${change.path}`}
									className="min-w-0 truncate text-left text-link cursor-pointer rounded-sm hover:bg-list-hover px-1 py-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
									disabled={!!busy}
									onClick={() => void act(change, "diff")}
									title={`${change.absolutePath}\n${locations}\nClick to view diff${change.undoUnavailableReason ? `\n${change.undoUnavailableReason}` : ""}`}>
									{change.path}
								</button>
								<Button
									aria-label={`Keep ${change.path}`}
									className="h-6 px-1 text-xs"
									disabled={!!busy || review.isRunning}
									onClick={() => void act(change, "keep")}
									size="sm"
									variant="ghost">
									Keep
								</Button>
								<Button
									aria-label={`Undo ${change.path}`}
									className="h-6 px-1 text-xs"
									disabled={!!busy || review.isRunning || !!change.undoUnavailableReason}
									onClick={() => void act(change, "undo")}
									size="sm"
									title={change.undoUnavailableReason}
									variant="ghost">
									Undo
								</Button>
								<span
									aria-label={`${change.additions} lines added`}
									className="text-success text-right tabular-nums whitespace-nowrap">
									+{change.additions}
								</span>
								<span
									aria-label={`${change.deletions} lines removed`}
									className="text-error text-right tabular-nums whitespace-nowrap">
									−{change.deletions}
								</span>
							</div>
						)
					})}
				</div>
				{review.isRunning && (
					<p className="m-0 mt-1 text-xs text-description">Review diffs now. Keep or undo after the agent finishes.</p>
				)}
			</details>
			{(error || review.error) && (
				<p className="m-0 mt-1 text-error break-words" role="alert">
					{error || review.error}
				</p>
			)}
		</section>
	)
}
