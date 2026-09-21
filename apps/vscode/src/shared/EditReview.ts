export interface EditReviewChange {
	id: string
	revision: number
	path: string
	absolutePath: string
	status: "added" | "modified" | "deleted"
	additions: number
	deletions: number
	hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[]
	undoUnavailableReason?: string
}

export interface EditReviewState {
	taskId: string
	changes: EditReviewChange[]
	isRunning: boolean
	error?: string
}
