import { beforeEach, describe, expect, it, vi } from "vitest"
import { HostProvider } from "@/hosts/host-provider"
import { Controller } from "./SdkController"

describe("file review controller actions", () => {
	const get = vi.fn()
	const resolve = vi.fn()
	const post = vi.fn()
	const getActiveSession = vi.fn()
	const open = vi.fn()
	let controller: Controller
	const request = { taskId: "active-task", changeId: "edit-1", revision: 3, action: "diff" }

	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(HostProvider, "diff", "get").mockReturnValue({ openMultiFileDiff: open } as unknown as typeof HostProvider.diff)
		open.mockResolvedValue({})
		controller = Object.assign(Object.create(Controller.prototype), {
			task: { taskId: "active-task" },
			sessions: { getActiveSession },
			editReview: { get, resolve },
			postStateToWebview: post,
		})
		getActiveSession.mockReturnValue({ isRunning: false })
		get.mockResolvedValue({ absolutePath: "C:/project/file.ts", before: "before\n", after: "after\n" })
		resolve.mockResolvedValue(undefined)
		post.mockResolvedValue(undefined)
	})

	it("opens the full saved before/after diff through the host bridge", async () => {
		await controller.reviewEdit(request)
		expect(get).toHaveBeenCalledWith("active-task", "edit-1", 3)
		expect(open).toHaveBeenCalledWith(
			expect.objectContaining({
				diffs: [{ filePath: "C:/project/file.ts", leftContent: "before\n", rightContent: "after\n" }],
			}),
		)
		expect(resolve).not.toHaveBeenCalled()
	})

	it("rejects requests from a different conversation", async () => {
		await expect(controller.reviewEdit({ ...request, taskId: "other-task", action: "undo" })).rejects.toThrow("Open the task")
		expect(resolve).not.toHaveBeenCalled()
	})

	it.each(["keep", "undo"])("blocks %s during execution", async (action) => {
		getActiveSession.mockReturnValue({ isRunning: true })
		await expect(controller.reviewEdit({ ...request, action })).rejects.toThrow("Wait for the agent")
		expect(resolve).not.toHaveBeenCalled()
	})

	it.each(["keep", "undo"])("applies %s to the specified revision and posts the new state", async (action) => {
		await controller.reviewEdit({ ...request, action })
		expect(resolve).toHaveBeenCalledWith("active-task", "edit-1", 3, action)
		expect(post).toHaveBeenCalledOnce()
	})
})
