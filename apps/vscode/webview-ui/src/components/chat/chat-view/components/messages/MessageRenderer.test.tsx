import type { BedrockCoderMessage } from "@shared/ExtensionMessage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MessageHandlers } from "../../types/chatTypes"
import { filterVisibleMessages, groupLowStakesTools, groupMessages } from "../../utils/messageUtils"
import { createMessageRenderer } from "./MessageRenderer"

const { resolvePath, revealPathInExplorer } = vi.hoisted(() => ({
	resolvePath: vi.fn(async ({ value }) => ({ value })),
	revealPathInExplorer: vi.fn(async () => ({})),
}))
vi.mock("@/services/grpc-client", () => ({
	FileServiceClient: { resolvePath, revealPathInExplorer, openFileRelativePath: vi.fn() },
	StateServiceClient: {},
	ModelsServiceClient: {},
	UiServiceClient: {},
}))
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mode: "act",
		mcpServers: [],
		bedrockCoderMessages: [],
		vscodeTerminalExecutionMode: "backgroundExec",
		showFeatureTips: false,
	}),
}))

function Transcript({ messages }: { messages: BedrockCoderMessage[] }) {
	const [expanded, setExpanded] = useState<Record<number, boolean>>({})
	const grouped = groupLowStakesTools(groupMessages(filterVisibleMessages(messages)))
	const renderMessage = createMessageRenderer(
		grouped,
		messages,
		expanded,
		(ts) => setExpanded((old) => ({ ...old, [ts]: !old[ts] })),
		vi.fn(),
		vi.fn(),
		vi.fn(),
		"",
		{ executeButtonAction: vi.fn(), handleSendMessage: vi.fn() } as unknown as MessageHandlers,
		false,
	)
	return <>{grouped.map((item, index) => renderMessage(index, item))}</>
}

describe("complete transcript rendering", () => {
	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it("preserves surrounding prose, reasoning, error details, and final output as file paths resolve", async () => {
		const messages: BedrockCoderMessage[] = [
			{ ts: 1, type: "say", say: "text", text: "First response before the read." },
			{ ts: 2, type: "say", say: "tool", text: JSON.stringify({ tool: "readFile", path: "/workspace/graph.json" }) },
			{ ts: 3, type: "say", say: "reasoning", text: "The graph needs a closer look.", partial: true },
			{
				ts: 4,
				type: "say",
				say: "api_req_started",
				text: JSON.stringify({ streamingFailedMessage: "A diagnostic error remains visible." }),
			},
			{ ts: 5, type: "say", say: "tool", text: JSON.stringify({ tool: "readFile", path: "benchmark/README.md" }) },
			{
				ts: 6,
				type: "say",
				say: "text",
				text: "After reading `benchmark/README.md`, the rest of the answer remains visible.",
				partial: true,
			},
		]
		const { rerender, container } = render(<Transcript messages={messages} />)
		await screen.findByRole("button", { name: "benchmark/README.md" })
		const updated = messages.map((message) => ({ ...message, partial: false }))
		updated[5].text += "\n\n- Keep the evaluation.\n- Check the graph.\n\nFINAL_RESPONSE_SENTINEL"
		rerender(<Transcript messages={JSON.parse(JSON.stringify(updated))} />)
		expect(screen.getByText("First response before the read.")).toBeVisible()
		expect(screen.getByRole("button", { name: "graph.json" })).toHaveAttribute("title", "/workspace/graph.json")
		expect(screen.getByText("A diagnostic error remains visible.")).toBeVisible()
		fireEvent.click(screen.getByRole("button", { name: /Thinking|Thought/i }))
		expect(screen.getByText("The graph needs a closer look.")).toBeVisible()
		fireEvent.click(screen.getByRole("button", { name: "benchmark/README.md" }))
		expect(revealPathInExplorer).toHaveBeenCalledWith({ value: "benchmark/README.md" })
		expect(container).toHaveTextContent("the rest of the answer remains visible.")
		expect(screen.getByText("FINAL_RESPONSE_SENTINEL")).toBeVisible()
		expect(screen.getAllByRole("listitem")).toHaveLength(2)
	})

	it("shows original content for a broken row while neighboring responses and later streaming updates survive", () => {
		vi.spyOn(console, "error").mockImplementation(() => {})
		const messages: BedrockCoderMessage[] = [
			{ ts: 1, type: "say", say: "text", text: "Before broken row" },
			{ ts: 2, type: "say", say: "api_req_started", text: "Incomplete JSON with original diagnostic text" },
			{ ts: 3, type: "say", say: "text", text: "After broken row" },
		]
		const { rerender } = render(<Transcript messages={messages} />)
		expect(screen.getByText("Formatting failed. Showing the original message.")).toBeVisible()
		expect(screen.getByText(messages[1].text!)).toBeVisible()
		expect(screen.getByText("Before broken row")).toBeVisible()
		expect(screen.getByText("After broken row")).toBeVisible()
		rerender(
			<Transcript
				messages={messages.map((message) =>
					message.ts === 2 ? { ...message, text: `${message.text} - NEW_STREAM_CONTENT` } : message,
				)}
			/>,
		)
		expect(screen.getByText(/original diagnostic text - NEW_STREAM_CONTENT/)).toBeVisible()
	})
})
