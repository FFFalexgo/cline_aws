import type { EditReviewState } from "@shared/EditReview"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditReviewPanel } from "./EditReviewPanel"

const { reviewEdit } = vi.hoisted(() => ({ reviewEdit: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({ FileServiceClient: { reviewEdit } }))

const review: EditReviewState = {
	taskId: "task-1",
	isRunning: false,
	changes: [
		{
			id: "change-1",
			revision: 2,
			path: "src/example.ts",
			absolutePath: "/workspace/src/example.ts",
			status: "modified",
			additions: 2,
			deletions: 1,
			hunks: [{ oldStart: 10, oldLines: 1, newStart: 10, newLines: 2 }],
		},
	],
}

describe("EditReviewPanel", () => {
	beforeEach(() => {
		reviewEdit.mockReset()
		reviewEdit.mockResolvedValue({})
	})

	it("shows file paths and line counts with locations on hover, and opens the exact reviewed revision", async () => {
		render(<EditReviewPanel review={review} />)
		expect(screen.getByText("src/example.ts")).toBeTruthy()
		expect(screen.getByLabelText("2 lines added")).toBeTruthy()
		expect(screen.getByLabelText("1 lines removed")).toBeTruthy()
		const file = screen.getByRole("button", { name: "Show diff for src/example.ts" })
		expect(file.getAttribute("title")).toContain("/workspace/src/example.ts")
		expect(file.getAttribute("title")).toContain("L10–11")
		fireEvent.click(file)
		await waitFor(() =>
			expect(reviewEdit).toHaveBeenCalledWith({ taskId: "task-1", changeId: "change-1", revision: 2, action: "diff" }),
		)
	})

	it.each(["Keep", "Undo"])("keeps the panel visible until the host confirms %s", async (action) => {
		const { rerender } = render(<EditReviewPanel review={review} />)
		fireEvent.click(screen.getByRole("button", { name: `${action} src/example.ts` }))
		await waitFor(() => expect(reviewEdit).toHaveBeenCalledWith(expect.objectContaining({ action: action.toLowerCase() })))
		expect(screen.getByRole("region", { name: "File changes" })).toBeTruthy()
		rerender(<EditReviewPanel review={{ ...review, changes: [] }} />)
		expect(screen.queryByRole("region", { name: "File changes" })).toBeNull()
	})

	it("keeps failed undo visible with its full reason", async () => {
		reviewEdit.mockRejectedValue(new Error("This file changed after the agent edited it."))
		render(<EditReviewPanel review={review} />)
		fireEvent.click(screen.getByRole("button", { name: "Undo src/example.ts" }))
		await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("changed after"))
		expect(screen.getByText("src/example.ts")).toBeTruthy()
	})

	it("allows diffs while running but defers keep and undo", () => {
		render(<EditReviewPanel review={{ ...review, isRunning: true }} />)
		expect(screen.getByRole("button", { name: "Keep src/example.ts" }).hasAttribute("disabled")).toBe(true)
		expect(screen.getByRole("button", { name: "Undo src/example.ts" }).hasAttribute("disabled")).toBe(true)
		expect(screen.getByRole("button", { name: "Show diff for src/example.ts" }).hasAttribute("disabled")).toBe(false)
	})
})
