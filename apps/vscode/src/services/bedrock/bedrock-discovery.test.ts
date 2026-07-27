import { ListFoundationModelsCommand, ListInferenceProfilesCommand } from "@aws-sdk/client-bedrock"
import { describe, expect, it, vi } from "vitest"
import { BedrockDiscoveryService } from "./bedrock-discovery"

describe("BedrockDiscoveryService", () => {
	it("filters models, joins profiles, deduplicates, and consumes every profile page", async () => {
		const send = vi.fn(async (command: unknown) => {
			if (command instanceof ListFoundationModelsCommand) {
				return {
					modelSummaries: [
						{
							modelId: "text-model",
							modelArn: "arn:aws:bedrock:us-east-1::foundation-model/text-model",
							modelName: "Text Model",
							providerName: "Example",
							inputModalities: ["TEXT"],
							outputModalities: ["TEXT"],
							responseStreamingSupported: true,
							inferenceTypesSupported: ["ON_DEMAND"],
							modelLifecycle: { status: "ACTIVE" },
						},
						{
							modelId: "image-model",
							modelArn: "arn:aws:bedrock:us-east-1::foundation-model/image-model",
							inputModalities: ["TEXT"],
							outputModalities: ["IMAGE"],
							responseStreamingSupported: true,
							inferenceTypesSupported: ["ON_DEMAND"],
							modelLifecycle: { status: "ACTIVE" },
						},
						{
							modelId: "embedding-model",
							inputModalities: ["TEXT"],
							outputModalities: ["EMBEDDING"],
							responseStreamingSupported: false,
							inferenceTypesSupported: ["ON_DEMAND"],
							modelLifecycle: { status: "ACTIVE" },
						},
						{
							modelId: "legacy-model",
							inputModalities: ["TEXT"],
							outputModalities: ["TEXT"],
							responseStreamingSupported: true,
							inferenceTypesSupported: ["ON_DEMAND"],
							modelLifecycle: { status: "LEGACY" },
						},
					],
				}
			}
			if (command instanceof ListInferenceProfilesCommand) {
				if (!command.input.nextToken) {
					return {
						inferenceProfileSummaries: [
							{
								inferenceProfileId: "us.text-model",
								inferenceProfileArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.text-model",
								inferenceProfileName: "US Text Model",
								status: "ACTIVE",
								type: "SYSTEM_DEFINED",
								models: [{ modelArn: "arn:aws:bedrock:us-east-1::foundation-model/text-model" }],
							},
							{
								inferenceProfileId: "us.image-model",
								inferenceProfileArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.image-model",
								inferenceProfileName: "US Stable Image",
								status: "ACTIVE",
								type: "SYSTEM_DEFINED",
								models: [{ modelArn: "arn:aws:bedrock:us-east-1::foundation-model/image-model" }],
							},
						],
						nextToken: "page-2",
					}
				}
				return {
					inferenceProfileSummaries: [
						{
							inferenceProfileId: "application-text",
							inferenceProfileArn:
								"arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/application-text",
							inferenceProfileName: "Application Text",
							status: "ACTIVE",
							type: "APPLICATION",
							models: [
								{
									modelArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.text-model",
								},
							],
						},
						{
							inferenceProfileId: "application-direct",
							inferenceProfileArn:
								"arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/application-direct",
							inferenceProfileName: "Application Direct",
							status: "ACTIVE",
							type: "APPLICATION",
							models: [],
						},
						{
							inferenceProfileId: "us.text-model",
							inferenceProfileArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.text-model",
							inferenceProfileName: "US Text Model",
							status: "ACTIVE",
							type: "SYSTEM_DEFINED",
							models: [{ modelArn: "arn:aws:bedrock:us-east-1::foundation-model/text-model" }],
						},
					],
				}
			}
			throw new Error("Unexpected command")
		})

		const result = await new BedrockDiscoveryService({ send }).discover(new AbortController().signal)

		expect(result.inferenceProfilePages).toBe(2)
		expect(result.targets.map((target) => target.displayName)).toEqual(["Text Model", "Application Text", "US Text Model"])
		expect(result.targets.some((target) => target.displayName.includes("Image"))).toBe(false)
		expect(result.targets.find((target) => target.displayName === "US Text Model")?.invocationId).toBe("us.text-model")
		expect(result.targets.find((target) => target.displayName === "Application Text")?.invocationId).toBe("application-text")
		expect(send).toHaveBeenCalledTimes(3)
		expect(result.connectionVerified).toBe(true)
	})

	it("continues with inference profiles when foundation-model discovery fails", async () => {
		const foundationFailure = Object.assign(new SyntaxError("Unexpected token '<'"), {
			$metadata: { httpStatusCode: 404, requestId: "request-404" },
		})
		const send = vi.fn(async (command: unknown) => {
			if (command instanceof ListFoundationModelsCommand) throw foundationFailure
			if (command instanceof ListInferenceProfilesCommand) {
				return {
					inferenceProfileSummaries: [
						{
							inferenceProfileId: "us.anthropic.claude-v1:0",
							inferenceProfileArn:
								"arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-v1:0",
							inferenceProfileName: "US Claude",
							status: "ACTIVE",
							type: "SYSTEM_DEFINED",
							models: [
								{
									modelArn: "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-v1:0",
								},
							],
						},
					],
				}
			}
			throw new Error("Unexpected command")
		})

		const result = await new BedrockDiscoveryService({ send }).discover(new AbortController().signal)

		expect(result.foundationModelCount).toBe(0)
		expect(result.inferenceProfileCount).toBe(1)
		expect(result.targets[0]).toMatchObject({
			kind: "inference-profile",
			invocationId: "us.anthropic.claude-v1:0",
			baseModelId: "anthropic.claude-v1:0",
			inputModalities: ["TEXT"],
			outputModalities: ["TEXT"],
		})
		expect(result.warnings).toEqual([
			expect.objectContaining({
				stage: "discoveringModels",
				operation: "ListFoundationModels",
				category: "endpoint",
				httpStatus: 404,
				requestId: "request-404",
			}),
		])
	})

	it("continues with foundation models when inference-profile discovery fails", async () => {
		const send = vi.fn(async (command: unknown) => {
			if (command instanceof ListFoundationModelsCommand) {
				return {
					modelSummaries: [
						{
							modelId: "text-model",
							modelName: "Text Model",
							inputModalities: ["TEXT"],
							outputModalities: ["TEXT"],
							responseStreamingSupported: true,
							inferenceTypesSupported: ["ON_DEMAND"],
							modelLifecycle: { status: "ACTIVE" },
						},
					],
				}
			}
			if (command instanceof ListInferenceProfilesCommand) throw new Error("profiles unavailable")
			throw new Error("Unexpected command")
		})

		const result = await new BedrockDiscoveryService({ send }).discover(new AbortController().signal)

		expect(result.foundationModelCount).toBe(1)
		expect(result.inferenceProfileCount).toBe(0)
		expect(result.targets.map((target) => target.invocationId)).toEqual(["text-model"])
		expect(result.warnings).toEqual([
			expect.objectContaining({
				stage: "discoveringProfiles",
				operation: "ListInferenceProfiles",
			}),
		])
	})

	it("keeps profile-only targets without requesting profile details", async () => {
		const send = vi.fn(async (command: unknown) => {
			if (command instanceof ListFoundationModelsCommand) throw new Error("foundation unavailable")
			if (command instanceof ListInferenceProfilesCommand) {
				return {
					inferenceProfileSummaries: [
						{
							inferenceProfileId: "us.profile-only",
							inferenceProfileArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.profile-only",
							inferenceProfileName: "US Profile Only",
							status: "ACTIVE",
						},
					],
				}
			}
			throw new Error("Unexpected command")
		})

		const result = await new BedrockDiscoveryService({ send }).discover(new AbortController().signal)

		expect(result.targets).toEqual([
			expect.objectContaining({
				kind: "inference-profile",
				invocationId: "us.profile-only",
				profileType: "SYSTEM_DEFINED",
				inputModalities: ["TEXT"],
				outputModalities: ["TEXT"],
			}),
		])
		expect(result.warnings).toHaveLength(1)
		expect(send).toHaveBeenCalledTimes(2)
	})

	it("reports both catalog failures with their correct operations", async () => {
		const send = vi.fn(async (command: unknown) => {
			if (command instanceof ListFoundationModelsCommand) throw new Error("foundation unavailable")
			if (command instanceof ListInferenceProfilesCommand) throw new Error("profiles unavailable")
			throw new Error("Unexpected command")
		})

		const result = await new BedrockDiscoveryService({ send }).discover(new AbortController().signal)

		expect(result.connectionVerified).toBe(false)
		expect(result.targets).toEqual([])
		expect(result.warnings.map((warning) => warning.operation)).toEqual(["ListFoundationModels", "ListInferenceProfiles"])
	})

	it("allows profiles backed by active streaming models that are not directly invocable", async () => {
		const send = vi.fn(async (command: unknown) => {
			if (command instanceof ListFoundationModelsCommand) {
				return {
					modelSummaries: [
						{
							modelId: "profile-only-model",
							modelArn: "arn:aws:bedrock:us-east-1::foundation-model/profile-only-model",
							modelName: "Profile-only Model",
							inputModalities: ["TEXT"],
							outputModalities: ["TEXT"],
							responseStreamingSupported: true,
							inferenceTypesSupported: ["INFERENCE_PROFILE"],
							modelLifecycle: { status: "ACTIVE" },
						},
					],
				}
			}
			if (command instanceof ListInferenceProfilesCommand) {
				return {
					inferenceProfileSummaries: [
						{
							inferenceProfileId: "us.profile-only-model",
							inferenceProfileName: "US Profile-only Model",
							status: "ACTIVE",
							type: "SYSTEM_DEFINED",
							models: [
								{
									modelArn: "arn:aws:bedrock:us-east-1::foundation-model/profile-only-model",
								},
							],
						},
					],
				}
			}
			throw new Error("Unexpected command")
		})

		const result = await new BedrockDiscoveryService({ send }).discover(new AbortController().signal)

		expect(result.foundationModelCount).toBe(0)
		expect(result.targets).toEqual([
			expect.objectContaining({
				kind: "inference-profile",
				invocationId: "us.profile-only-model",
				baseModelId: "profile-only-model",
			}),
		])
	})
})
