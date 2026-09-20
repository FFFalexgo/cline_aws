import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createVscodeRunCommandsTool } from "./vscode-run-commands-tool"

const mocks = vi.hoisted(() => {
	// The shared test setup imports the tool definitions before this suite.
	vi.resetModules()
	return { spawn: vi.fn() }
})

vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:child_process")>()),
	spawn: mocks.spawn,
}))

vi.mock("@/core/storage/StateManager", () => ({
	StateManager: { get: () => ({ getGlobalSettingsKey: () => "default" }) },
}))

describe("VS Code background command timeout", () => {
	let child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
	const context = { agentId: "timeout-test", iteration: 0 }

	beforeEach(() => {
		vi.useFakeTimers()
		child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
		mocks.spawn.mockReturnValue(child)
	})

	afterEach(() => {
		child.emit("close", 0)
		vi.clearAllTimers()
		vi.useRealTimers()
		mocks.spawn.mockReset()
	})

	function createTool(bashTimeoutMs?: number) {
		return createVscodeRunCommandsTool({
			cwd: process.cwd(),
			bashTimeoutMs,
			getTerminalManager: () => {
				throw new Error("Background commands must not create a terminal")
			},
		})
	}

	it("allows a command to finish after the old 30-second deadline", async () => {
		let settled = false
		const result = Promise.resolve(createTool().execute({ commands: ["build"] }, context)).then((value) => {
			settled = true
			return value
		})
		expect(mocks.spawn).toHaveBeenCalledOnce()

		await vi.advanceTimersByTimeAsync(31_000)
		expect(settled).toBe(false)
		child.stdout.emit("data", Buffer.from("Build completed"))
		child.emit("close", 0)
		await expect(result).resolves.toEqual([{ query: "build", result: "Build completed", success: true }])
	})

	it("times out an unfinished command after five minutes", async () => {
		let settled = false
		const result = Promise.resolve(createTool().execute({ commands: ["build"] }, context)).then((value) => {
			settled = true
			return value
		})

		await vi.advanceTimersByTimeAsync(299_999)
		expect(settled).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		await expect(result).resolves.toMatchObject([{ success: false, error: expect.stringContaining("300000ms") }])
	})

	it("honors an explicit timeout in both the tool and process runner", async () => {
		let settled = false
		const result = Promise.resolve(createTool(60_000).execute({ commands: ["build"] }, context)).then((value) => {
			settled = true
			return value
		})

		await vi.advanceTimersByTimeAsync(59_999)
		expect(settled).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		await expect(result).resolves.toMatchObject([{ success: false, error: expect.stringContaining("60000ms") }])
	})

	it("still cancels a running command immediately", async () => {
		const controller = new AbortController()
		const result = createTool().execute({ commands: ["build"] }, { ...context, signal: controller.signal })
		controller.abort()
		await expect(result).resolves.toMatchObject([{ success: false, error: expect.stringContaining("aborted") }])
	})
})
