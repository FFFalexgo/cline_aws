import { describe, expect, it } from "vitest"
import { AgentRunLifecycle, sanitizeRunFailure } from "./run-lifecycle"

describe("run failure diagnostics", () => {
	it("unwraps provider errors without truncating diagnostic details", () => {
		const details = `Expected string at output.content\n${"context ".repeat(500)}END_OF_ERROR`
		const failure = sanitizeRunFailure(
			new Error(
				JSON.stringify({
					message: "Model response validation failed",
					code: "AI_TypeValidationError",
					request_id: "request-1",
					status: 200,
					details,
				}),
			),
			"stream",
		)
		expect(failure).toMatchObject({
			message: "Model response validation failed",
			code: "AI_TypeValidationError",
			requestId: "request-1",
			httpStatus: 200,
			details,
		})
	})

	it("retains plain-text tails and nested error causes while redacting credentials", () => {
		const longError = `${"details ".repeat(500)}END_OF_ERROR`
		expect(sanitizeRunFailure(longError, "stream").details).toBe(longError)
		const failure = sanitizeRunFailure(
			new Error("Request failed", { cause: new Error("Expected array; secretAccessKey=hidden-credential") }),
			"stream",
		)
		expect(failure.details).toContain("Expected array")
		expect(failure.details).toContain("run-lifecycle.test.ts")
		expect(failure.details).not.toContain("hidden-credential")
	})
})

describe("AgentRunLifecycle", () => {
	it.each([
		{
			name: "success",
			drive: (lifecycle: AgentRunLifecycle, runId: string) => {
				expect(lifecycle.requestSent(runId, 20)).toBe(true)
				expect(lifecycle.firstEvent(runId, 35)).toBe(true)
				expect(lifecycle.complete(runId, 50)).toBe(true)
			},
			phase: "completed",
		},
		{
			name: "failure",
			drive: (lifecycle: AgentRunLifecycle, runId: string) => {
				lifecycle.requestSent(runId, 20)
				lifecycle.fail(runId, sanitizeRunFailure(new Error("stream broke"), "stream"), 30)
			},
			phase: "failed",
		},
		{
			name: "cancellation",
			drive: (lifecycle: AgentRunLifecycle, runId: string) => {
				lifecycle.requestSent(runId, 20)
				expect(lifecycle.requestCancellation(runId, 25)).toBe(true)
				expect(lifecycle.requestCancellation(runId, 26)).toBe(true)
				expect(lifecycle.firstEvent(runId, 27)).toBe(false)
				expect(lifecycle.fail(runId, sanitizeRunFailure(new Error("late failure"), "stream"), 28)).toBe(false)
				expect(lifecycle.complete(runId, 29)).toBe(false)
				lifecycle.cancelled(runId, 40)
			},
			phase: "cancelled",
		},
	])("reaches exactly one terminal state for $name", ({ drive, phase }) => {
		const lifecycle = new AgentRunLifecycle()
		const runId = lifecycle.begin({ sessionId: "session-1", invocationId: "model-1", now: 10 })
		drive(lifecycle, runId)

		expect(lifecycle.get().phase).toBe(phase)
		expect(lifecycle.complete(runId, 60)).toBe(false)
		expect(lifecycle.fail(runId, sanitizeRunFailure(new Error("late"), "stream"), 70)).toBe(false)
		expect(lifecycle.get().phase).toBe(phase)
	})

	it("ignores late mutations from a superseded run", () => {
		const lifecycle = new AgentRunLifecycle()
		const oldRunId = lifecycle.begin({ sessionId: "session-1", now: 10 })
		lifecycle.cancelled(oldRunId, 20)
		const newRunId = lifecycle.begin({ sessionId: "session-1", now: 30 })

		expect(lifecycle.firstEvent(oldRunId, 40)).toBe(false)
		expect(lifecycle.complete(oldRunId, 50)).toBe(false)
		expect(lifecycle.get()).toMatchObject({ runId: newRunId, phase: "submitting" })
	})
})
