import type { AgentMessage, AgentModelEvent } from "@bedrock-coder/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBedrockAgentModel, createBedrockClient } from "./compat";

// Encode actual AWS event-stream frames so the real adapter validates the payloads.
function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function frame(event: string, payload: unknown): Buffer {
	const headers = Buffer.concat(
		Object.entries({ ":message-type": "event", ":event-type": event }).map(
			([name, value]) => {
				const header = Buffer.alloc(1 + name.length + 1 + 2 + value.length);
				header.writeUInt8(name.length, 0);
				header.write(name, 1);
				header.writeUInt8(7, 1 + name.length);
				header.writeUInt16BE(value.length, 2 + name.length);
				header.write(value, 4 + name.length);
				return header;
			},
		),
	);
	const body = Buffer.from(JSON.stringify(payload));
	const result = Buffer.alloc(16 + headers.length + body.length);
	result.writeUInt32BE(result.length, 0);
	result.writeUInt32BE(headers.length, 4);
	result.writeUInt32BE(crc32(result.subarray(0, 8)), 8);
	headers.copy(result, 12);
	body.copy(result, 12 + headers.length);
	result.writeUInt32BE(crc32(result.subarray(0, -4)), result.length - 4);
	return result;
}

function response(reasoning: Record<string, unknown>[]): Response {
	const bytes = Buffer.concat([
		frame("messageStart", { role: "assistant" }),
		...reasoning.map((reasoningContent) =>
			frame("contentBlockDelta", {
				contentBlockIndex: 0,
				delta: { reasoningContent },
			}),
		),
		frame("contentBlockStop", { contentBlockIndex: 0 }),
		frame("contentBlockDelta", {
			contentBlockIndex: 1,
			delta: { text: "I will read the file." },
		}),
		frame("contentBlockStop", { contentBlockIndex: 1 }),
		frame("contentBlockStart", {
			contentBlockIndex: 2,
			start: { toolUse: { toolUseId: "call_read", name: "read_file" } },
		}),
		frame("contentBlockDelta", {
			contentBlockIndex: 2,
			delta: { toolUse: { input: '{"path":"README.md"}' } },
		}),
		frame("contentBlockStop", { contentBlockIndex: 2 }),
		frame("messageStop", { stopReason: "tool_use" }),
		frame("metadata", { usage: { inputTokens: 20, outputTokens: 10 } }),
	]);
	return new Response(
		new ReadableStream({
			start(controller) {
				// Split both headers and payloads across transport chunks.
				for (let index = 0; index < bytes.length; index += 37) {
					controller.enqueue(bytes.subarray(index, index + 37));
				}
				controller.close();
			},
		}),
		{ headers: { "content-type": "application/vnd.amazon.eventstream" } },
	);
}

const user: AgentMessage = {
	id: "user",
	role: "user",
	createdAt: 1,
	content: [{ type: "text", text: "Read README.md" }],
};

describe("Bedrock reasoning wire compatibility", () => {
	afterEach(() => vi.unstubAllGlobals());

	function model() {
		return createBedrockAgentModel({
			providerId: "bedrock",
			modelId: "us.openai.gpt-5.6-sol",
			connection: {
				region: "us-east-1",
				credentialProvider: async () => ({
					accessKeyId: "test-access",
					secretAccessKey: "test-secret",
				}),
			},
		});
	}

	async function collect(messages: AgentMessage[] = [user]) {
		const events: AgentModelEvent[] = [];
		for await (const event of await model().stream({
			messages,
			tools: [
				{
					name: "read_file",
					description: "Read a file",
					inputSchema: {
						type: "object",
						properties: { path: { type: "string" } },
						required: ["path"],
					},
				},
			],
		}))
			events.push(event);
		return events;
	}

	it("accepts encrypted reasoning and replays it with the tool result", async () => {
		const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) =>
			response([{ redactedContent: "ZW5jcnlw" }, { redactedContent: "dGVk" }]),
		);
		vi.stubGlobal("fetch", fetchMock);
		const events = await collect();
		expect(events.at(-1)).toMatchObject({
			type: "finish",
			reason: "tool-calls",
			error: undefined,
		});
		expect(events).toContainEqual({
			type: "text-delta",
			text: "I will read the file.",
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "tool-call-delta",
				toolCallId: "call_read",
				toolName: "read_file",
				input: { path: "README.md" },
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "reasoning-delta",
				blockId: "0",
				text: "",
				redacted: true,
				metadata: { redactedContent: "ZW5jcnlwdGVk" },
			}),
		);
		const encrypted = events.find((event) => event.type === "reasoning-delta");
		if (encrypted?.type !== "reasoning-delta")
			throw new Error("Missing encrypted block");
		const assistant: AgentMessage = {
			id: "assistant",
			role: "assistant",
			createdAt: 2,
			content: [
				{
					type: "reasoning",
					text: encrypted.text,
					redacted: encrypted.redacted,
					metadata: encrypted.metadata,
				},
				{ type: "text", text: "I will read the file." },
				{
					type: "tool-call",
					toolCallId: "call_read",
					toolName: "read_file",
					input: { path: "README.md" },
				},
			],
		};
		await collect([
			user,
			assistant,
			{
				id: "tool",
				role: "tool",
				createdAt: 3,
				content: [
					{
						type: "tool-result",
						toolCallId: "call_read",
						toolName: "read_file",
						output: "File contents",
					},
				],
			},
		]);
		const request = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
		expect(request.messages[1].content).toEqual([
			{ reasoningContent: { redactedContent: "ZW5jcnlwdGVk" } },
			{ text: "I will read the file." },
			{
				toolUse: {
					toolUseId: "call_read",
					name: "read_file",
					input: { path: "README.md" },
				},
			},
		]);
		expect(request.messages[2].content[0].toolResult.toolUseId).toBe(
			"call_read",
		);
	});

	it.each([
		{
			reasoning: [
				{ text: "Considering the file." },
				{ signature: "signed-by-provider" },
			],
			metadata: { signature: "signed-by-provider" },
			text: "Considering the file.",
			wire: {
				reasoningText: {
					text: "Considering the file.",
					signature: "signed-by-provider",
				},
			},
		},
		{
			reasoning: [{ data: "legacy-encrypted" }],
			metadata: { redactedData: "legacy-encrypted" },
			text: "",
			wire: { redactedReasoning: { data: "legacy-encrypted" } },
		},
	])("preserves existing reasoning formats: $metadata", async ({
		reasoning,
		metadata,
		text,
		wire,
	}) => {
		const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) =>
			response(reasoning),
		);
		vi.stubGlobal("fetch", fetchMock);
		const events = await collect();
		expect(events.at(-1)).toMatchObject({
			type: "finish",
			reason: "tool-calls",
		});
		expect(events).toContainEqual(
			expect.objectContaining({ type: "reasoning-delta", metadata }),
		);
		expect(
			events
				.filter((event) => event.type === "reasoning-delta")
				.map((event) => event.text)
				.join(""),
		).toBe(text);
		await collect([
			user,
			{
				id: "assistant",
				role: "assistant",
				createdAt: 2,
				content: [
					{ type: "reasoning", text, metadata },
					{ type: "text", text: "Reading." },
				],
			},
			{ ...user, id: "next" },
		]);
		const request = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
		expect(request.messages[1].content[0]).toEqual({ reasoningContent: wire });
	});

	it("replays persisted encrypted blocks through the message client", async () => {
		const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) =>
			response([]),
		);
		vi.stubGlobal("fetch", fetchMock);
		const client = createBedrockClient({
			providerId: "bedrock",
			modelId: "us.openai.gpt-5.6-sol",
			connection: {
				region: "us-east-1",
				credentialProvider: async () => ({
					accessKeyId: "test-access",
					secretAccessKey: "test-secret",
				}),
			},
		});
		let completed = false;
		for await (const event of client.createMessage(
			"Continue the task.",
			[
				{ role: "user", content: "Read the file." },
				{
					role: "assistant",
					content: [
						{
							type: "redacted_thinking",
							data: "encrypted",
							metadata: { redactedContent: "encrypted" },
						},
						{ type: "text", text: "Reading." },
					],
				},
				{ role: "user", content: "Continue." },
			],
			[
				{
					name: "read_file",
					description: "Read a file",
					inputSchema: {
						type: "object",
						properties: { path: { type: "string" } },
						required: ["path"],
					},
				},
			],
		)) {
			if (event.type === "done") {
				expect(event.success).toBe(true);
				completed = true;
			}
		}
		expect(completed).toBe(true);
		const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
		expect(request.messages[1].content).toEqual([
			{ reasoningContent: { redactedContent: "encrypted" } },
			{ text: "Reading." },
		]);
	});

	it("still reports invalid reasoning values instead of suppressing validation errors", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => response([{ redactedContent: 42 }])),
		);
		const finish = (await collect()).at(-1);
		expect(finish).toMatchObject({ type: "finish", reason: "error" });
		if (finish?.type !== "finish") throw new Error("Missing finish event");
		expect(JSON.parse(finish.error!)).toMatchObject({
			code: "AI_TypeValidationError",
		});
	});
});
