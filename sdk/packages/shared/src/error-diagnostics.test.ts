import { describe, expect, it } from "vitest";
import {
	formatErrorDiagnostics,
	redactErrorDiagnostics,
} from "./error-diagnostics";

describe("error diagnostics", () => {
	it("preserves non-enumerable messages, stack traces, validation causes, and long payloads", () => {
		const error = Object.assign(
			new Error("Type validation failed", {
				cause: Object.assign(new Error("Expected string"), {
					issues: [
						{
							path: ["output", "content", 0, "text"],
							expected: "string",
							received: "null",
						},
					],
				}),
			}),
			{
				name: "AI_TypeValidationError",
				value: { text: `${"response ".repeat(500)}END_OF_RESPONSE` },
			},
		);
		const parsed = JSON.parse(formatErrorDiagnostics(error));
		expect(parsed).toMatchObject({
			name: "AI_TypeValidationError",
			message: "Type validation failed",
			cause: {
				message: "Expected string",
				issues: [
					{ expected: "string", path: ["output", "content", 0, "text"] },
				],
			},
		});
		expect(parsed.stack).toContain("error-diagnostics.test.ts");
		expect(parsed.value.text).toBe(error.value.text);
	});

	it("redacts credentials in validation values and embedded messages while excluding request bodies", () => {
		const result = formatErrorDiagnostics({
			message: 'Bad response: {"sessionToken":"embedded-secret"}',
			requestBody: "private-prompt",
			requestHeaders: { Authorization: "private-header" },
			value: {
				apiKey: "private-key",
				nested: {
					secretAccessKey: "private-secret",
					text: "schema explanation",
				},
			},
			cause: {
				message: "Authorization: Bearer private-auth\nExpected array",
				value: "https://example.test/?X-Amz-Signature=private-signature",
			},
		});
		for (const secret of [
			"embedded-secret",
			"private-prompt",
			"private-header",
			"private-key",
			"private-secret",
			"private-auth",
			"private-signature",
		])
			expect(result).not.toContain(secret);
		expect(result).toContain("Expected array");
		expect(result).toContain("schema explanation");
	});

	it("handles cyclic causes, primitive throws, and bigint values", () => {
		const error = Object.assign(new Error("failed"), { value: 10n, cause: {} });
		error.cause = error;
		expect(JSON.parse(formatErrorDiagnostics(error))).toMatchObject({
			cause: "[Circular]",
			value: "10",
		});
		expect(formatErrorDiagnostics("plain failure")).toBe("plain failure");
		expect(formatErrorDiagnostics(null)).toBe("null");
		expect(redactErrorDiagnostics("Bearer confidential-token")).not.toContain(
			"confidential-token",
		);
	});
});
