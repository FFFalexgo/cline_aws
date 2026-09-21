import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SdkDiffEditCoordinator } from "./sdk-diff-edit-coordinator"
import { SdkEditReviewStore } from "./sdk-edit-review-store"

describe("persistent edit review", () => {
	let directory: string
	let store: SdkEditReviewStore
	const isDirty = vi.fn(() => false)
	const changed = vi.fn()
	const task = "task-one"
	const file = () => path.join(directory, "file.txt")
	const createStore = () =>
		new SdkEditReviewStore({
			getDirectory: async (id) => {
				const target = path.join(directory, "reviews", id)
				await fs.mkdir(target, { recursive: true })
				return target
			},
			isDirty,
			onChanged: changed,
		})
	const edit = (content: string) =>
		store.track(
			task,
			directory,
			async () => [file()],
			() => fs.writeFile(file(), content),
		)
	const resolve = async (action: "keep" | "undo") => {
		const [change] = await store.list(task)
		return store.resolve(task, change.id, change.revision, action)
	}

	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-edit-review-"))
		isDirty.mockReturnValue(false)
		changed.mockClear()
		store = createStore()
	})
	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true })
	})

	it("retains the original pre-agent contents across repeated edits and reload", async () => {
		await fs.writeFile(file(), "my existing work\nold\n")
		await edit("my existing work\nnew\n")
		await edit("my existing work\nnew\nextra\n")
		store = createStore()
		const [change] = await store.list(task)
		expect(change).toMatchObject({
			status: "modified",
			additions: 2,
			deletions: 1,
			revision: 2,
			hunks: [{ oldStart: 2, oldLines: 1, newStart: 2, newLines: 2 }],
		})
		await resolve("undo")
		expect(await fs.readFile(file(), "utf8")).toBe("my existing work\nold\n")
		expect(await createStore().list(task)).toEqual([])
	})

	it("keeps a change without writing and starts a fresh review for the next edit", async () => {
		await edit("kept\n")
		await resolve("keep")
		expect(await createStore().list(task)).toEqual([])
		expect(await fs.readFile(file(), "utf8")).toBe("kept\n")
		await edit("next\n")
		await resolve("undo")
		expect(await fs.readFile(file(), "utf8")).toBe("kept\n")
	})

	it("undoes creation and deletion, including empty files", async () => {
		await edit("")
		expect((await store.list(task))[0].status).toBe("added")
		await resolve("undo")
		await expect(fs.stat(file())).rejects.toMatchObject({ code: "ENOENT" })
		await fs.writeFile(file(), "deleted\n")
		await store.track(
			task,
			directory,
			async () => [file()],
			() => fs.unlink(file()),
		)
		expect((await store.list(task))[0]).toMatchObject({ status: "deleted", additions: 0, deletions: 1 })
		await resolve("undo")
		expect(await fs.readFile(file(), "utf8")).toBe("deleted\n")
	})

	it("refuses undo after an external edit and keeps the review entry", async () => {
		await edit("agent\n")
		await fs.writeFile(file(), "my newer edit\n")
		await expect(resolve("undo")).rejects.toThrow("changed after")
		expect(await fs.readFile(file(), "utf8")).toBe("my newer edit\n")
		expect(await store.list(task)).toHaveLength(1)
	})

	it("refuses undo when a user edit occurred between two agent edits", async () => {
		await edit("agent\n")
		await fs.writeFile(file(), "my edit\n")
		await edit("my edit\nmore agent\n")
		expect((await store.list(task))[0].undoUnavailableReason).toBeDefined()
		await expect(resolve("undo")).rejects.toThrow("your own edits")
		expect(await fs.readFile(file(), "utf8")).toBe("my edit\nmore agent\n")
	})

	it("protects unsaved editor changes", async () => {
		await edit("agent\n")
		isDirty.mockReturnValue(true)
		await expect(resolve("undo")).rejects.toThrow("your own edits")
		expect(await store.list(task)).toHaveLength(1)
	})

	it("rejects stale review actions instead of accepting newer unseen edits", async () => {
		await edit("first\n")
		const [stale] = await store.list(task)
		await edit("second\n")
		await expect(store.resolve(task, stale.id, stale.revision, "keep")).rejects.toThrow("updated")
		await expect(store.get(task, stale.id, stale.revision)).rejects.toThrow("updated")
		expect(await store.list(task)).toHaveLength(1)
	})

	it("retains actual writes when a patch fails partway through", async () => {
		await expect(
			store.track(
				task,
				directory,
				async () => [file()],
				async () => {
					await fs.writeFile(file(), "partial\n")
					throw new Error("second file failed")
				},
			),
		).rejects.toThrow("second file failed")
		expect(await createStore().list(task)).toHaveLength(1)
		await resolve("undo")
		await expect(fs.stat(file())).rejects.toMatchObject({ code: "ENOENT" })
	})

	it("isolates tasks and omits failed or no-op edits", async () => {
		await fs.writeFile(file(), "same\n")
		await edit("same\n")
		expect(await store.list(task)).toEqual([])
		await expect(
			store.track(
				task,
				directory,
				async () => [file()],
				async () => {
					throw new Error("no write")
				},
			),
		).rejects.toThrow("no write")
		expect(await store.list(task)).toEqual([])
		await edit("changed\n")
		expect(await store.list("another-task")).toEqual([])
	})

	it("allows state reads from inside an executing tool without deadlocking", async () => {
		await store.track(
			task,
			directory,
			async () => [file()],
			async () => {
				expect(await store.list(task)).toEqual([])
				await fs.writeFile(file(), "done\n")
			},
		)
		expect(await store.list(task)).toHaveLength(1)
	})

	it("tracks auto-approved editor and patch tools, including both paths of a move", async () => {
		const coordinator = new SdkDiffEditCoordinator({
			getCwd: async () => directory,
			trackEdit: (cwd, paths, execute) => store.track(task, cwd, paths, execute),
		})
		const context = { agentId: "test", iteration: 1, toolCallId: "edit-1" }
		await coordinator.executeEditorTool({ path: "file.txt", new_text: "original\n" }, directory, context)
		expect((await store.list(task))[0]).toMatchObject({ status: "added", additions: 1 })
		await resolve("keep")
		await coordinator.executeApplyPatchTool(
			{ input: "*** Begin Patch\n*** Update File: file.txt\n*** Move to: moved.txt\n@@\n-original\n+moved\n*** End Patch" },
			directory,
			{ ...context, toolCallId: "edit-2" },
		)
		expect(await store.list(task)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "file.txt", status: "deleted" }),
				expect.objectContaining({ path: "moved.txt", status: "added" }),
			]),
		)
	})
})
