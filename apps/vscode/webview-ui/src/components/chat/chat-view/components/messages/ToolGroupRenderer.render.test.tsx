import type { BedrockCoderMessage } from "@shared/ExtensionMessage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { openFileRelativePath } = vi.hoisted(() => ({ openFileRelativePath: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({ FileServiceClient: { openFileRelativePath } }))

import { ToolGroupRenderer } from "./ToolGroupRenderer"

function readMessage(ts: number, path: string): BedrockCoderMessage {
	return { ts, type: "say", say: "tool", text: JSON.stringify({ tool: "readFile", path }) }
}

describe("file read labels", () => {
	beforeEach(() => openFileRelativePath.mockReset().mockResolvedValue({}))
	afterEach(cleanup)

	it.each([
		"/Users/cchen96/BMODev/AgentFlow/benchmark/graph/paystub/package/graph.json",
		"C:\\Users\\chang\\Project Files\\graph.json",
		"benchmark/graph/paystub/package/graph.json",
	])("shows the filename and full path tooltip for %s", (path) => {
		const messages = [readMessage(1, path)]
		render(<ToolGroupRenderer allMessages={messages} isLastGroup messages={messages} />)

		const file = screen.getByRole("button", { name: "graph.json" })
		expect(file).toHaveAttribute("title", path)
		fireEvent.click(file)
		expect(openFileRelativePath).toHaveBeenCalledWith({ value: path })
	})

	it("distinguishes matching filenames by path and preserves line ranges", () => {
		const first = "/workspace/benchmark/README.md"
		const second = "/workspace/README.md"
		const messages = [
			readMessage(1, first),
			{
				...readMessage(2, second),
				text: JSON.stringify({ tool: "readFile", path: second, readLineStart: 10, readLineEnd: 30 }),
			},
		]
		render(<ToolGroupRenderer allMessages={messages} isLastGroup messages={messages} />)

		expect(screen.getByRole("button", { name: "README.md" })).toHaveAttribute("title", first)
		expect(screen.getByRole("button", { name: "README.md · lines 10-30" })).toHaveAttribute("title", second)
		expect(screen.getByText("Bedrock Coder read 2 files:")).toBeVisible()
	})
})
