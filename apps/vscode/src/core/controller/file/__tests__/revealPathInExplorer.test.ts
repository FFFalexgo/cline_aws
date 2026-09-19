import { beforeEach, describe, expect, it, mock } from "bun:test"
import type { Controller } from "../.."

const resolve = mock(async () => ({ value: "C:/workspace/src/main.ts" }))
const reveal = mock(async (_request: { path: string }) => ({}))
const showMessage = mock(async () => ({}))
mock.module("../resolvePath", () => ({ resolvePath: resolve }))
mock.module("@/hosts/host-provider", () => ({
	HostProvider: { workspace: { openInFileExplorerPanel: reveal }, window: { showMessage } },
}))

import { revealPathInExplorer } from "../revealPathInExplorer"

describe("revealPathInExplorer", () => {
	beforeEach(() => {
		resolve.mockReset().mockResolvedValue({ value: "C:/workspace/src/main.ts" })
		reveal.mockReset().mockResolvedValue({})
		showMessage.mockReset().mockResolvedValue({})
	})
	it("reveals the resolved workspace path through the host Explorer", async () => {
		await revealPathInExplorer({} as Controller, { value: "src/main.ts:12" })
		expect(reveal).toHaveBeenCalledWith({ path: "C:/workspace/src/main.ts" })
		expect(showMessage).not.toHaveBeenCalled()
	})
	it("reports a missing path without revealing an empty URI", async () => {
		resolve.mockResolvedValue({ value: "" })
		await revealPathInExplorer({} as Controller, { value: "missing.ts" })
		expect(reveal).not.toHaveBeenCalled()
		expect(showMessage).toHaveBeenCalledTimes(1)
	})
	it("waits for the host operation and propagates its failure", async () => {
		reveal.mockRejectedValue(new Error("Explorer unavailable"))
		await expect(revealPathInExplorer({} as Controller, { value: "src/main.ts" })).rejects.toThrow("Explorer unavailable")
	})
})
