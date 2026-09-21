import type { BedrockCoderMessage } from "@shared/ExtensionMessage"
import { describe, expect, it } from "vitest"
import {
	canRestoreWorkspaceFromMessage,
	filterVisibleMessages,
	groupLowStakesTools,
	groupMessages,
	isLowStakesTool,
	isToolGroup,
} from "./messageUtils"

const createTextMessage = (ts: number, text: string): BedrockCoderMessage => ({
	type: "say",
	say: "text",
	text,
	ts,
})

const createToolMessage = (ts: number, tool: string): BedrockCoderMessage => ({
	type: "say",
	say: "tool",
	text: JSON.stringify({ tool, path: "src/file.ts" }),
	ts,
})

const createReasoningMessage = (ts: number, text: string): BedrockCoderMessage => ({
	type: "say",
	say: "reasoning",
	text,
	ts,
})

const createUserFeedbackMessage = (ts: number, text: string): BedrockCoderMessage => ({
	type: "say",
	say: "user_feedback",
	text,
	ts,
})

const createTaskMessage = (ts: number, text: string): BedrockCoderMessage => ({
	type: "say",
	say: "task",
	text,
	ts,
})

const createAskMessage = (
	ts: number,
	ask: "followup" | "plan_mode_respond",
	options: string[],
	selected?: string,
): BedrockCoderMessage => ({
	type: "ask",
	ask,
	text: JSON.stringify(
		ask === "followup" ? { question: "Pick one", options, selected } : { response: "Pick one", options, selected },
	),
	ts,
})

describe("filterVisibleMessages", () => {
	it("hides exact user feedback echoes for selected follow-up options", () => {
		const askMessage = createAskMessage(1, "followup", ["Use this", "Use that"], "Use this")
		const visible = filterVisibleMessages([askMessage, createUserFeedbackMessage(2, "Use this")])

		expect(visible).toEqual([askMessage])
	})

	it("hides exact option echoes when selected has not been persisted on the ask row yet", () => {
		const askMessage = createAskMessage(1, "followup", ["Use this", "Use that"])
		const visible = filterVisibleMessages([askMessage, createUserFeedbackMessage(2, "Use this")])

		expect(visible).toEqual([askMessage])
	})

	it("hides exact user feedback echoes for plan-mode response options", () => {
		const askMessage = createAskMessage(1, "plan_mode_respond", ["Plan it", "Do it"], "Plan it")
		const visible = filterVisibleMessages([askMessage, createUserFeedbackMessage(2, "Plan it")])

		expect(visible).toEqual([askMessage])
	})

	it("keeps custom user feedback that extends a selected option", () => {
		const askMessage = createAskMessage(1, "followup", ["Use this", "Use that"], "Use this")
		const userMessage = createUserFeedbackMessage(2, "Use this: include tests")
		const visible = filterVisibleMessages([askMessage, userMessage])

		expect(visible).toEqual([askMessage, userMessage])
	})

	it("keeps exact option feedback when it includes attachments", () => {
		const askMessage = createAskMessage(1, "followup", ["Use this", "Use that"], "Use this")
		const userMessage: BedrockCoderMessage = {
			...createUserFeedbackMessage(2, "Use this"),
			images: ["data:image/png;base64,abc"],
		}
		const visible = filterVisibleMessages([askMessage, userMessage])

		expect(visible).toEqual([askMessage, userMessage])
	})
})

describe("canRestoreWorkspaceFromMessage", () => {
	it("allows restore for user messages that start runs, but not ask answers", () => {
		const messages = [
			createTaskMessage(1, "start"),
			createAskMessage(2, "followup", ["src/index.ts"]),
			createTextMessage(3, "Which file should I inspect?"),
			createUserFeedbackMessage(4, "src/index.ts"),
			createUserFeedbackMessage(5, "next task"),
		]

		expect(canRestoreWorkspaceFromMessage(messages, 1)).toBe(true)
		expect(canRestoreWorkspaceFromMessage(messages, 4)).toBe(false)
		expect(canRestoreWorkspaceFromMessage(messages, 5)).toBe(true)
		expect(canRestoreWorkspaceFromMessage(messages, 999)).toBe(false)
	})
})

describe("groupLowStakesTools", () => {
	it("preserves browser history and later responses when grouping metadata is malformed", () => {
		const history: BedrockCoderMessage[] = [
			{ ts: 1, type: "say", say: "browser_action_launch", text: "https://example.test" },
			{ ts: 2, type: "say", say: "api_req_started", text: "incomplete metadata" },
			{ ts: 3, type: "say", say: "api_req_started", text: "{}" },
			createTextMessage(4, "The response after malformed metadata remains."),
			{ ts: 5, type: "say", say: "browser_action_launch", text: "https://example.test" },
			{ ts: 6, type: "say", say: "browser_action", text: "incomplete browser action" },
			createTextMessage(7, "The response after a malformed action remains."),
		]
		expect(groupMessages(history).flat()).toEqual(history)
	})

	it.each([
		"readFile",
		"listFilesTopLevel",
		"listFilesRecursive",
		"listCodeDefinitionNames",
		"searchFiles",
	])("preserves every response in every streaming prefix and saved history around %s", (tool) => {
		const responses: BedrockCoderMessage[] = [
			createTextMessage(0, "Text before and after src/file.ts must remain."),
			createReasoningMessage(0, "Reasoning around file reads must remain."),
			{ ts: 0, type: "say", say: "completion_result", text: "Final answer with `src/file.ts`." },
			{ ts: 0, type: "say", say: "error", text: "Full error must remain." },
			{ ts: 0, type: "say", say: "api_req_started", text: JSON.stringify({ streamingFailedMessage: "Validation failed" }) },
			{ ts: 0, type: "say", say: "api_req_started", text: JSON.stringify({ cancelReason: "user_cancelled" }) },
		]
		for (const partial of [true, false]) {
			for (const response of responses) {
				const transcript = [
					{ ...response, ts: 1, partial },
					createToolMessage(2, tool),
					{ ...response, ts: 3, partial },
					createToolMessage(4, tool),
					{ ...response, ts: 5, partial },
				]
				for (let count = 1; count <= transcript.length; count++) {
					const prefix = transcript.slice(0, count)
					for (const history of [prefix, JSON.parse(JSON.stringify(prefix)) as BedrockCoderMessage[]]) {
						const grouped = groupLowStakesTools(groupMessages(filterVisibleMessages(history)))
						expect(grouped.flat()).toEqual(history)
						for (const group of grouped.filter(isToolGroup)) expect(group.every(isLowStakesTool)).toBe(true)
					}
				}
			}
		}
	})

	it("keeps every response between and after reads when API rows are filtered out", () => {
		const reasoning = createReasoningMessage(5, "The first file explains the failure. I will check the graph next.")
		const summary = createTextMessage(7, "The graph uses an outdated field. Update `src/file.ts` to fix it.")
		const finalReasoning = createReasoningMessage(8, "The diagnosis is complete.")
		const messages: BedrockCoderMessage[] = [
			{ ts: 1, type: "say", say: "api_req_started", text: JSON.stringify({ cost: 0 }) },
			createTextMessage(2, "I will inspect the evaluation files."),
			createToolMessage(3, "readFile"),
			{ ts: 4, type: "say", say: "api_req_started", text: JSON.stringify({ cost: 0 }) },
			reasoning,
			createToolMessage(6, "readFile"),
			summary,
			finalReasoning,
		]
		const grouped = groupLowStakesTools(groupMessages(filterVisibleMessages(messages)))

		expect(grouped).toEqual([messages[1], expect.any(Array), reasoning, expect.any(Array), summary, finalReasoning])
		expect(
			grouped
				.filter(isToolGroup)
				.flat()
				.map((message) => message.ts),
		).toEqual([3, 6])
	})

	it("keeps a streaming reasoning message visible after the last file read", () => {
		const reasoning = { ...createReasoningMessage(2, "Checking the result"), partial: true }
		const grouped = groupLowStakesTools([createToolMessage(1, "readFile"), reasoning])

		expect(grouped).toEqual([expect.any(Array), reasoning])
	})

	it("keeps text that arrives after a low-stakes tool group by finalizing the group first", () => {
		const grouped = groupLowStakesTools([
			createTextMessage(1, "Initial text"),
			createToolMessage(2, "readFile"),
			createTextMessage(3, "Post-tool summary text"),
		])

		expect(grouped).toHaveLength(3)
		expect(grouped[0]).toMatchObject({ type: "say", say: "text", text: "Initial text" })
		expect(isToolGroup(grouped[1])).toBe(true)
		expect(grouped[2]).toMatchObject({ type: "say", say: "text", text: "Post-tool summary text" })
	})

	it("keeps text when no low-stakes tool group is active", () => {
		const grouped = groupLowStakesTools([
			createTextMessage(1, "Initial text"),
			createToolMessage(2, "editedExistingFile"),
			createTextMessage(3, "Follow-up text"),
		])

		expect(grouped).toHaveLength(3)
		expect(grouped[0]).toMatchObject({ type: "say", say: "text", text: "Initial text" })
		expect(grouped[1]).toMatchObject({ type: "say", say: "tool" })
		expect(grouped[2]).toMatchObject({ type: "say", say: "text", text: "Follow-up text" })
	})

	it("keeps standalone reasoning when no low-stakes tool group follows", () => {
		const grouped = groupLowStakesTools([
			createReasoningMessage(1, "Thinking through options"),
			createTextMessage(2, "Answer text"),
		])

		expect(grouped).toHaveLength(2)
		expect(grouped[0]).toMatchObject({ type: "say", say: "reasoning", text: "Thinking through options" })
		expect(grouped[1]).toMatchObject({ type: "say", say: "text", text: "Answer text" })
	})

	it("keeps standalone reasoning before a non-low-stakes tool", () => {
		const grouped = groupLowStakesTools([
			createReasoningMessage(1, "Thinking through options"),
			createToolMessage(2, "editedExistingFile"),
		])

		expect(grouped).toHaveLength(2)
		expect(grouped[0]).toMatchObject({ type: "say", say: "reasoning", text: "Thinking through options" })
		expect(grouped[1]).toMatchObject({ type: "say", say: "tool" })
	})

	it("keeps reasoning visible when low-stakes tool group starts immediately after", () => {
		const grouped = groupLowStakesTools([createReasoningMessage(1, "Planning next read"), createToolMessage(2, "readFile")])

		expect(grouped).toHaveLength(2)
		expect(grouped[0]).toMatchObject({ type: "say", say: "reasoning", text: "Planning next read" })
		expect(isToolGroup(grouped[1])).toBe(true)
	})
})
