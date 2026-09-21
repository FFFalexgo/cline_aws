import type {
	AgentModelEvent,
	GatewayProviderContext,
} from "@bedrock-coder/shared";
import { describe, expect, it, vi } from "vitest";

const { streamText } = vi.hoisted(() => ({ streamText: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
	...(await importOriginal<typeof import("ai")>()),
	streamText,
}));
vi.mock("./vendors/bedrock", () => ({
	createBedrockProviderModule: async () => ({ model: () => ({}) }),
}));

import { createBedrockProvider } from "./ai-sdk";

describe("Bedrock streaming error diagnostics", () => {
	it.each([
		"event",
		"iteration",
		"usage",
		"callback",
		"provider",
	])("preserves the original validation cause from %s", async (source) => {
		const original = Object.assign(
			new Error("Type validation failed", {
				cause: {
					message: "Expected string at output.text",
					issues: [{ path: ["output", "text"], expected: "string" }],
				},
			}),
			{ name: "AI_TypeValidationError" },
		);
		streamText.mockImplementation(({ onError }) => {
			if (source === "provider") throw original;
			return {
				fullStream: (async function* () {
					yield { type: "text-delta", text: "Partial response stays visible." };
					if (source === "event") yield { type: "error", error: original };
					if (source === "iteration") throw original;
					if (source === "callback") {
						onError({ error: original });
						throw new Error("No output generated");
					}
				})(),
				usage:
					source === "usage"
						? Promise.reject(original)
						: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
			};
		});
		const provider = await createBedrockProvider({ providerId: "bedrock" });
		const context: GatewayProviderContext = {
			config: { providerId: "bedrock" },
			provider: {
				id: "bedrock",
				name: "Bedrock",
				defaultModelId: "test-model",
				models: [],
			},
			model: { id: "test-model", name: "Test model", providerId: "bedrock" },
		};
		const events: AgentModelEvent[] = [];
		for await (const event of await provider.stream(
			{ providerId: "bedrock", modelId: "test-model", messages: [] },
			context,
		))
			events.push(event);
		const finish = events.find((event) => event.type === "finish");
		expect(finish?.reason).toBe("error");
		const envelope = JSON.parse(finish?.error ?? "{}");
		expect(envelope).toMatchObject({
			code: "AI_TypeValidationError",
			modelId: "test-model",
		});
		expect(envelope.details).toContain("Expected string at output.text");
		expect(envelope.details).not.toContain("No output generated");
		if (source !== "provider")
			expect(events[0]).toEqual({
				type: "text-delta",
				text: "Partial response stays visible.",
			});
	});
});
