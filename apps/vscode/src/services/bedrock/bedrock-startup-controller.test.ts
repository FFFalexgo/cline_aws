import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BedrockTarget } from "@shared/bedrock-startup"
import { describe, expect, it, vi } from "vitest"
import type { StateManager } from "@/core/storage/StateManager"
import { BedrockStartupController } from "./bedrock-startup-controller"
import type { BedrockStartupDoctor } from "./bedrock-startup-doctor"

const target: BedrockTarget = {
	kind: "inference-profile",
	invocationId: "us.example.text-v1:0",
	arn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.example.text-v1:0",
	displayName: "US Example Text",
	baseModelId: "example.text-v1:0",
	profileType: "SYSTEM_DEFINED",
	inputModalities: ["TEXT"],
	outputModalities: ["TEXT"],
	streaming: true,
	lifecycle: "ACTIVE",
}

function fakeStateManager(modelId = target.invocationId) {
	const values: Record<string, unknown> = {
		awsRegion: "us-east-1",
		actModeApiModelId: modelId,
		planModeApiModelId: modelId,
	}
	return {
		values,
		getApiConfiguration: () => ({ ...values }),
		getGlobalSettingsKey: (key: string) => values[key],
		setGlobalStateBatch: (updates: Record<string, unknown>) => Object.assign(values, updates),
	} as unknown as StateManager & { values: Record<string, unknown> }
}

async function createController(doctor: BedrockStartupDoctor, modelId?: string) {
	const stateManager = fakeStateManager(modelId)
	return {
		controller: new BedrockStartupController({
			stateManager,
			workspaceRoot: async () => "C:\\workspace",
			logDirectory: await mkdtemp(join(tmpdir(), "bedrock-startup-")),
			onStateChanged: async () => {},
			doctor,
		}),
		stateManager,
	}
}

describe("BedrockStartupController", () => {
	it("requires explicit confirmation before probing the selected target", async () => {
		const probe = vi.fn(async () => ({ inputTokens: 3, outputTokens: 1 }))
		const doctor = {
			discover: vi.fn(async ({ onStage }: { onStage: (stage: string) => void }) => {
				onStage("validatingIdentity")
				onStage("discoveringModels")
				onStage("discoveringProfiles")
				return {
					connectionVerified: true,
					targets: [target],
					foundationModelCount: 0,
					inferenceProfileCount: 1,
					inferenceProfilePages: 1,
					warnings: [],
					maskedAccountId: "12••••••••12",
				}
			}),
			probe,
		} as unknown as BedrockStartupDoctor
		const { controller, stateManager } = await createController(doctor)

		await controller.start(true)

		expect(controller.state.phase).toBe("awaitingSelection")
		expect(controller.state.connectionVerified).toBe(true)
		expect(probe).not.toHaveBeenCalled()

		await controller.selectTarget(target.kind, target.invocationId)

		expect(controller.state.phase).toBe("ready")
		expect(probe).toHaveBeenCalledWith(expect.objectContaining({ target }))
		expect(stateManager.values.actModeApiModelId).toBe(target.invocationId)
		expect(controller.state.probe).toMatchObject({ status: "succeeded", usage: { inputTokens: 3, outputTokens: 1 } })
	})

	it("preserves both catalog failures instead of relabeling the first failure", async () => {
		const warnings = [
			{
				stage: "discoveringModels",
				category: "endpoint" as const,
				service: "bedrock" as const,
				operation: "ListFoundationModels",
				httpStatus: 404,
				message: "The configured AWS endpoint is invalid or unreachable.",
			},
			{
				stage: "discoveringProfiles",
				category: "endpoint" as const,
				service: "bedrock" as const,
				operation: "ListInferenceProfiles",
				httpStatus: 404,
				message: "The configured AWS endpoint is invalid or unreachable.",
			},
		]
		const doctor = {
			discover: vi.fn(async () => ({
				connectionVerified: false,
				targets: [],
				foundationModelCount: 0,
				inferenceProfileCount: 0,
				inferenceProfilePages: 0,
				warnings,
			})),
			probe: vi.fn(),
		} as unknown as BedrockStartupDoctor
		const { controller } = await createController(doctor)

		await controller.start(true)

		expect(controller.state.phase).toBe("failed")
		expect(controller.state.catalogWarnings).toEqual(warnings)
		expect(controller.state.error?.operation).toBe("ListFoundationModels")
	})

	it("cancels an in-flight startup check into an explicit cancelled state", async () => {
		const discover = vi.fn(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					const cancel = () => {
						const error = new Error("cancelled")
						error.name = "AbortError"
						reject(error)
					}
					if (signal.aborted) cancel()
					else signal.addEventListener("abort", cancel, { once: true })
				}),
		)
		const doctor = {
			discover,
			probe: vi.fn(),
		} as unknown as BedrockStartupDoctor
		const { controller } = await createController(doctor)

		const running = controller.start(true)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(discover).toHaveBeenCalledOnce()
		controller.cancel()
		await running

		expect(controller.state.phase).toBe("cancelled")
		expect(controller.state.error?.category).toBe("cancelled")
	})

	it("publishes a categorized AWS failure", async () => {
		const doctor = {
			discover: async ({ onStage }: { onStage: (stage: string) => void }) => {
				onStage("discoveringModels")
				throw Object.assign(new Error("Access denied"), {
					name: "AccessDeniedException",
					$metadata: { httpStatusCode: 403, requestId: "request-456" },
				})
			},
			probe: vi.fn(),
		} as unknown as BedrockStartupDoctor
		const { controller } = await createController(doctor)

		await controller.start(true)

		expect(controller.state.phase).toBe("failed")
		expect(controller.state.error).toMatchObject({
			category: "authorization",
			service: "bedrock",
			operation: "ListFoundationModels",
			requestId: "request-456",
		})
	})

	it("reports an invalid runtime endpoint as endpoint validation rather than STS", async () => {
		const doctor = {
			discover: async () => {
				throw new Error("BEDROCK_ENDPOINT: The AWS endpoint must be a Bedrock Runtime endpoint.")
			},
			probe: vi.fn(),
		} as unknown as BedrockStartupDoctor
		const { controller } = await createController(doctor)

		await controller.start(true)

		expect(controller.state.error).toMatchObject({
			category: "endpoint",
			service: "bedrock-runtime",
			operation: "ValidateEndpoint",
		})
	})
})
