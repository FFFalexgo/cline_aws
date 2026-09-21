import type { BedrockCoderMessage } from "@shared/ExtensionMessage"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ErrorRow from "./ErrorRow"
import { RunStatusBar } from "./RunStatusBar"

const { openLog } = vi.hoisted(() => ({ openLog: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({ ModelsServiceClient: { openBedrockDiagnosticLog: openLog } }))
const message: BedrockCoderMessage = { ts: 1, type: "say", say: "error" }
const details = `Expected string at output.content[0].text\n${"validation context ".repeat(200)}END_OF_ERROR`
const writeText = vi.fn().mockResolvedValue(undefined)

describe("chat error details", () => {
	beforeEach(() => {
		writeText.mockClear()
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
	})
	afterEach(cleanup)

	it.each([
		"apiRequestFailedMessage",
		"apiReqStreamingFailedMessage",
		"text",
	] as const)("shows and copies full diagnostics from %s", async (source) => {
		const raw = JSON.stringify({
			message: "Model response validation failed",
			code: "AI_TypeValidationError",
			request_id: "request-123",
			providerId: "bedrock",
			modelId: "test-model",
			details,
		})
		render(
			<ErrorRow
				errorType="error"
				message={{ ...message, text: source === "text" ? raw : "fallback" }}
				{...(source === "text" ? {} : { [source]: raw })}
			/>,
		)
		expect(screen.getByText("Model response validation failed")).toBeVisible()
		expect(screen.queryByLabelText("Full error details")).toBeNull()
		const toggle = screen.getByRole("button", { name: "Show full error" })
		expect(toggle).toHaveAttribute("aria-expanded", "false")
		fireEvent.click(toggle)
		expect(toggle).toHaveAttribute("aria-expanded", "true")
		const full = screen.getByLabelText("Full error details")
		for (const text of [details, "AI_TypeValidationError", "request-123", "test-model"])
			expect(full.textContent).toContain(text)
		fireEvent.click(screen.getByRole("button", { name: "Copy full error" }))
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(full.textContent))
		fireEvent.click(screen.getByRole("button", { name: "Hide full error" }))
		expect(screen.queryByLabelText("Full error details")).toBeNull()
	})

	it("keeps multiline plain errors and legacy structured causes available", () => {
		const { rerender } = render(<ErrorRow errorType="error" message={{ ...message, text: `Request failed\n${details}` }} />)
		fireEvent.click(screen.getByRole("button", { name: "Show full error" }))
		expect(screen.getByLabelText("Full error details").textContent).toBe(`Request failed\n${details}`)
		rerender(
			<ErrorRow
				errorType="error"
				message={{
					...message,
					text: JSON.stringify({
						message: "Request failed",
						cause: { message: "Expected array" },
						stack: "error-stack-frame",
					}),
				}}
			/>,
		)
		expect(screen.getByLabelText("Full error details").textContent).toContain("Expected array")
		expect(screen.getByLabelText("Full error details").textContent).toContain("error-stack-frame")
	})

	it("offers diagnostics and copying in the failed run status", async () => {
		render(
			<RunStatusBar
				run={{
					seq: 1,
					phase: "failed",
					stageStartedAt: 1,
					failure: { message: "Request failed", source: "stream", retrySafe: true, details, requestId: "request-123" },
				}}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: "Copy full error" }))
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(details)))
		fireEvent.click(screen.getByRole("button", { name: "Show full error" }))
		expect(screen.getByLabelText("Full error details").textContent).toContain("request-123")
		fireEvent.click(screen.getByRole("button", { name: "Open diagnostic log" }))
		expect(openLog).toHaveBeenCalled()
	})
})
