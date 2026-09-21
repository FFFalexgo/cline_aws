import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { EditReviewChange } from "@shared/EditReview"
import { structuredPatch } from "diff"

interface StoredChange {
	id: string
	revision: number
	absolutePath: string
	path: string
	before: string | null
	after: string | null
	mode?: number
	conflicted?: boolean
}

interface ReviewStoreOptions {
	getDirectory: (taskId: string) => Promise<string>
	isDirty: (absolutePath: string) => boolean
	onChanged: () => void
}

/** Retains actual edit-tool writes separately from the conversation and Git index. */
export class SdkEditReviewStore {
	private readonly tasks = new Map<string, StoredChange[]>()
	private readonly loading = new Map<string, Promise<StoredChange[]>>()
	private readonly summaries = new WeakMap<StoredChange, EditReviewChange>()
	private tail: Promise<unknown> = Promise.resolve()

	constructor(private readonly options: ReviewStoreOptions) {}

	private exclusive<T>(action: () => Promise<T>): Promise<T> {
		const result = this.tail.then(action)
		this.tail = result.catch(() => {})
		return result
	}

	async list(taskId: string): Promise<EditReviewChange[]> {
		// State updates must not wait on an executing tool, which may itself emit state updates.
		return (await this.load(taskId)).map((change) => {
			let summary = this.summaries.get(change)
			if (!summary) {
				summary = summarizeChange(change)
				this.summaries.set(change, summary)
			}
			return summary
		})
	}

	async get(taskId: string, id: string, revision: number): Promise<StoredChange> {
		return this.exclusive(async () => ({ ...this.find(await this.load(taskId), id, revision) }))
	}

	track<T>(taskId: string, cwd: string, paths: () => Promise<string[]>, execute: () => Promise<T>): Promise<T> {
		return this.exclusive(async () => {
			const changes = (await this.load(taskId)).map((change) => ({ ...change }))
			const targets = [
				...new Map((await paths()).map((file) => [pathKey(path.resolve(file)), path.resolve(file)])).values(),
			]
			const before = new Map<string, { content: string | null; mode?: number }>()
			for (const file of targets) before.set(file, await readSnapshot(file))
			try {
				return await execute()
			} finally {
				// Also retain files written by a patch that fails partway through.
				for (const file of targets) {
					const original = before.get(file)!
					const current = await readSnapshot(file)
					if (original.content === current.content) continue
					const existing = changes.find((change) => pathKey(change.absolutePath) === pathKey(file))
					if (existing) {
						existing.conflicted ||= existing.after !== original.content
						existing.after = current.content
						existing.revision += 1
					} else {
						changes.push({
							id: randomUUID(),
							revision: 1,
							absolutePath: file,
							path: path.relative(cwd, file) || path.basename(file),
							before: original.content,
							after: current.content,
							mode: original.mode,
						})
					}
				}
				const pending = changes.filter((change) => change.before !== change.after)
				this.tasks.set(taskId, pending)
				try {
					await this.persist(taskId, pending)
				} finally {
					this.options.onChanged()
				}
			}
		})
	}

	resolve(taskId: string, id: string, revision: number, action: "keep" | "undo"): Promise<void> {
		return this.exclusive(async () => {
			const changes = await this.load(taskId)
			const change = this.find(changes, id, revision)
			if (action === "undo") {
				if (change.conflicted || this.options.isDirty(change.absolutePath)) {
					throw new Error(
						"This file has your own edits. Review the diff and undo the agent's changes manually to preserve them.",
					)
				}
				const current = await readSnapshot(change.absolutePath)
				if (current.content !== change.after) {
					throw new Error(
						"This file changed after the agent edited it. Undo was stopped to preserve the newer changes.",
					)
				}
				if (change.before === null) {
					await fs.unlink(change.absolutePath)
				} else if (change.after === null) {
					// Exclusive creation must not replace a file recreated since the check.
					await fs.writeFile(change.absolutePath, change.before, { flag: "wx", mode: change.mode })
				} else {
					await fs.writeFile(change.absolutePath, change.before)
				}
			}
			await this.persist(
				taskId,
				changes.filter((item) => item.id !== id),
			)
			this.options.onChanged()
		})
	}

	private find(changes: StoredChange[], id: string, revision: number): StoredChange {
		const change = changes.find((item) => item.id === id)
		if (!change || change.revision !== revision)
			throw new Error("This file's changes have updated. Review the latest diff and try again.")
		return change
	}

	private async load(taskId: string): Promise<StoredChange[]> {
		const cached = this.tasks.get(taskId)
		if (cached) return cached
		const pending = this.loading.get(taskId)
		if (pending) return pending
		const load = this.readSaved(taskId)
		this.loading.set(taskId, load)
		try {
			return await load
		} finally {
			this.loading.delete(taskId)
		}
	}

	private async readSaved(taskId: string): Promise<StoredChange[]> {
		let changes: StoredChange[] = []
		try {
			const content = JSON.parse(
				await fs.readFile(path.join(await this.options.getDirectory(taskId), "edit-review.json"), "utf8"),
			)
			if (!Array.isArray(content) || !content.every(isStoredChange)) throw new Error("Invalid saved file review data")
			changes = content
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		}
		this.tasks.set(taskId, changes)
		return changes
	}

	private async persist(taskId: string, changes: StoredChange[]): Promise<void> {
		const file = path.join(await this.options.getDirectory(taskId), "edit-review.json")
		const temporary = `${file}.tmp`
		await fs.writeFile(temporary, JSON.stringify(changes), { mode: 0o600 })
		await fs.rename(temporary, file)
		this.tasks.set(taskId, changes)
	}
}

async function readSnapshot(file: string): Promise<{ content: string | null; mode?: number }> {
	try {
		const stat = await fs.lstat(file)
		if (!stat.isFile()) throw new Error(`Cannot review a non-regular file: ${file}`)
		const bytes = await fs.readFile(file)
		const content = bytes.toString("utf8")
		if (!Buffer.from(content, "utf8").equals(bytes)) throw new Error(`Cannot review a binary file: ${file}`)
		return { content, mode: stat.mode }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { content: null }
		throw error
	}
}

function pathKey(file: string): string {
	return process.platform === "win32" ? file.toLowerCase() : file
}

function isStoredChange(value: unknown): value is StoredChange {
	if (!value || typeof value !== "object") return false
	const item = value as StoredChange
	return (
		typeof item.id === "string" &&
		Number.isInteger(item.revision) &&
		item.revision > 0 &&
		typeof item.absolutePath === "string" &&
		path.isAbsolute(item.absolutePath) &&
		typeof item.path === "string" &&
		(item.before === null || typeof item.before === "string") &&
		(item.after === null || typeof item.after === "string")
	)
}

function summarizeChange(change: StoredChange): EditReviewChange {
	const patch = structuredPatch(change.path, change.path, change.before ?? "", change.after ?? "", "", "", { context: 0 })
	return {
		id: change.id,
		revision: change.revision,
		path: change.path,
		absolutePath: change.absolutePath,
		status: change.before === null ? "added" : change.after === null ? "deleted" : "modified",
		additions: patch.hunks.reduce((sum, hunk) => sum + hunk.newLines, 0),
		deletions: patch.hunks.reduce((sum, hunk) => sum + hunk.oldLines, 0),
		hunks: patch.hunks.map(({ oldStart, oldLines, newStart, newLines }) => ({ oldStart, oldLines, newStart, newLines })),
		undoUnavailableReason: change.conflicted
			? "This file also has changes made outside the agent. Review and undo manually."
			: undefined,
	}
}
