import { describe, expect, it } from "vitest";
import { sanitizeBedrockError, serializeBedrockError } from "./bedrock-errors";

describe("sanitizeBedrockError", () => {
	it("distinguishes response schema errors from request and credential failures", () => {
		expect(
			sanitizeBedrockError({
				name: "AI_TypeValidationError",
				message: "Type validation failed: expected string at credentials",
			}),
		).toContain("model response did not match");
		expect(
			sanitizeBedrockError({
				name: "ValidationException",
				message: "Invalid model request",
			}),
		).toContain("rejected the request as invalid");
	});

	it("carries the original validation cause and AWS metadata through a string error channel", () => {
		const error = Object.assign(
			new Error("Type validation failed", {
				cause: {
					message: "Expected an array at output.content",
					issues: [{ path: ["output", "content"], expected: "array" }],
				},
			}),
			{
				name: "AI_TypeValidationError",
				value: { output: { content: null } },
				$metadata: { requestId: "request-789", httpStatusCode: 200 },
			},
		);
		const envelope = JSON.parse(serializeBedrockError(error, "test-model"));
		expect(envelope).toMatchObject({
			code: "AI_TypeValidationError",
			request_id: "request-789",
			status: 200,
			modelId: "test-model",
			providerId: "bedrock",
		});
		expect(envelope.message).toContain("model response did not match");
		expect(JSON.parse(envelope.details)).toMatchObject({
			cause: { message: "Expected an array at output.content" },
			value: error.value,
		});
	});

	it("preserves the AWS error code and request ID", () => {
		expect(
			sanitizeBedrockError({
				name: "AccessDeniedException",
				message: "Access denied",
				$metadata: { requestId: "request-123" },
			}),
		).toBe(
			"Bedrock access-denied: AWS denied access to the requested Bedrock resource. Error code: AccessDeniedException. Request ID: request-123",
		);
	});

	it("does not include credential-like error details", () => {
		const message = sanitizeBedrockError({
			code: "ExpiredTokenException",
			message:
				"The security token temporary-secret-value included in the request is expired",
			$metadata: { requestId: "request-456" },
		});

		expect(message).toContain("Error code: ExpiredTokenException.");
		expect(message).toContain("Request ID: request-456");
		expect(message).not.toContain("temporary-secret-value");
	});

	it("omits unsafe error codes", () => {
		const message = sanitizeBedrockError({
			code: "AccessDenied: secret=do-not-log",
			message: "Access denied",
		});

		expect(message).not.toContain("do-not-log");
	});
});
