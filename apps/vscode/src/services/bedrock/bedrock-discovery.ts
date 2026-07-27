import {
	type FoundationModelSummary,
	type InferenceProfileSummary,
	ListFoundationModelsCommand,
	ListInferenceProfilesCommand,
} from "@aws-sdk/client-bedrock"
import type { BedrockDoctorError, BedrockTarget } from "@shared/bedrock-startup"
import { mapBedrockDoctorError } from "./bedrock-errors"

export interface BedrockControlPlaneClient {
	send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>
}

export interface BedrockDiscoveryResult {
	connectionVerified: boolean
	targets: BedrockTarget[]
	foundationModelCount: number
	inferenceProfileCount: number
	inferenceProfilePages: number
	warnings: BedrockDoctorError[]
}

function normalized(values: readonly string[] | undefined): string[] {
	return (values ?? []).map((value) => value.toUpperCase())
}

export function isCompatibleFoundationModel(summary: FoundationModelSummary): boolean {
	const lifecycle = summary.modelLifecycle?.status
	const input = normalized(summary.inputModalities)
	const output = normalized(summary.outputModalities)
	return (
		Boolean(summary.modelId) &&
		(!lifecycle || lifecycle === "ACTIVE") &&
		input.includes("TEXT") &&
		output.includes("TEXT") &&
		summary.responseStreamingSupported === true
	)
}

function supportsDirectInvocation(summary: FoundationModelSummary): boolean {
	return normalized(summary.inferenceTypesSupported).includes("ON_DEMAND")
}

export function foundationTarget(summary: FoundationModelSummary): BedrockTarget | undefined {
	if (!isCompatibleFoundationModel(summary) || !supportsDirectInvocation(summary) || !summary.modelId) return undefined
	return targetFromFoundationSummary(summary)
}

function targetFromFoundationSummary(summary: FoundationModelSummary): BedrockTarget {
	const modelId = summary.modelId as string
	return {
		kind: "foundation-model",
		invocationId: modelId,
		arn: summary.modelArn,
		displayName: summary.modelName?.trim() || modelId,
		providerName: summary.providerName,
		baseModelId: modelId,
		inputModalities: [...(summary.inputModalities ?? [])],
		outputModalities: [...(summary.outputModalities ?? [])],
		streaming: true,
		lifecycle: summary.modelLifecycle?.status,
	}
}

function arnResourceId(arn: string | undefined): string | undefined {
	if (!arn) return undefined
	return arn.split("/").at(-1)
}

function targetKey(target: BedrockTarget): string {
	return `${target.kind}:${target.invocationId}`
}

function throwIfCancelled(error: unknown, signal: AbortSignal): void {
	if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error
}

function catalogError(
	error: unknown,
	stage: "discoveringModels" | "discoveringProfiles",
	operation: "ListFoundationModels" | "ListInferenceProfiles",
): BedrockDoctorError {
	return mapBedrockDoctorError(error, {
		stage,
		service: "bedrock",
		operation,
	})
}

export class BedrockDiscoveryService {
	constructor(private readonly client: BedrockControlPlaneClient) {}

	async discover(
		signal: AbortSignal,
		onStage?: (stage: "discoveringModels" | "discoveringProfiles") => void,
	): Promise<BedrockDiscoveryResult> {
		const warnings: BedrockDoctorError[] = []
		onStage?.("discoveringModels")
		let foundationCatalogAvailable = false
		let foundationSummaries: FoundationModelSummary[] = []
		try {
			const foundationResponse = (await this.client.send(new ListFoundationModelsCommand({}), {
				abortSignal: signal,
			})) as { modelSummaries?: FoundationModelSummary[] }
			foundationSummaries = foundationResponse.modelSummaries ?? []
			foundationCatalogAvailable = true
		} catch (error) {
			throwIfCancelled(error, signal)
			warnings.push(catalogError(error, "discoveringModels", "ListFoundationModels"))
		}

		const compatibleFoundations = foundationSummaries.filter(isCompatibleFoundationModel)
		const foundationTargets = compatibleFoundations.flatMap((summary) => {
			const target = foundationTarget(summary)
			return target ? [target] : []
		})

		onStage?.("discoveringProfiles")
		const profileSummaries: InferenceProfileSummary[] = []
		let nextToken: string | undefined
		let inferenceProfilePages = 0
		let profileCatalogAvailable = false
		try {
			do {
				const response = (await this.client.send(new ListInferenceProfilesCommand({ nextToken }), {
					abortSignal: signal,
				})) as { inferenceProfileSummaries?: InferenceProfileSummary[]; nextToken?: string }
				profileCatalogAvailable = true
				inferenceProfilePages += 1
				profileSummaries.push(...(response.inferenceProfileSummaries ?? []))
				nextToken = response.nextToken
			} while (nextToken)
		} catch (error) {
			throwIfCancelled(error, signal)
			warnings.push(catalogError(error, "discoveringProfiles", "ListInferenceProfiles"))
		}

		const foundationByReference = new Map<string, BedrockTarget>()
		for (const summary of compatibleFoundations) {
			const target = targetFromFoundationSummary(summary)
			foundationByReference.set(target.invocationId, target)
			if (target.arn) foundationByReference.set(target.arn, target)
		}
		const profilesByReference = new Map<string, InferenceProfileSummary>()
		for (const profile of profileSummaries) {
			if (profile.inferenceProfileId) profilesByReference.set(profile.inferenceProfileId, profile)
			if (profile.inferenceProfileArn) profilesByReference.set(profile.inferenceProfileArn, profile)
		}

		const resolveBase = (profile: InferenceProfileSummary, visited = new Set<string>()): BedrockTarget | undefined => {
			const identity = profile.inferenceProfileArn ?? profile.inferenceProfileId
			if (!identity || visited.has(identity)) return undefined
			visited.add(identity)
			for (const model of profile.models ?? []) {
				const reference = model.modelArn
				const direct =
					foundationByReference.get(reference ?? "") ?? foundationByReference.get(arnResourceId(reference) ?? "")
				if (direct) return direct
				const nested = profilesByReference.get(reference ?? "") ?? profilesByReference.get(arnResourceId(reference) ?? "")
				if (nested) {
					const resolved = resolveBase(nested, visited)
					if (resolved) return resolved
				}
			}
			return undefined
		}

		const resolveBaseModelId = (profile: InferenceProfileSummary, visited = new Set<string>()): string | undefined => {
			const identity = profile.inferenceProfileArn ?? profile.inferenceProfileId
			if (!identity || visited.has(identity)) return undefined
			visited.add(identity)
			for (const model of profile.models ?? []) {
				const reference = model.modelArn
				if (!reference) continue
				const foundationId = reference.includes("foundation-model/") ? arnResourceId(reference) : undefined
				if (foundationId) return foundationId
				const nested = profilesByReference.get(reference) ?? profilesByReference.get(arnResourceId(reference) ?? "")
				if (nested) {
					const resolved = resolveBaseModelId(nested, visited)
					if (resolved) return resolved
				}
			}
			return undefined
		}

		const profileTargets = profileSummaries.flatMap((profile): BedrockTarget[] => {
			if (profile.status !== "ACTIVE" || !profile.inferenceProfileId) return []
			const base = resolveBase(profile)
			if (foundationCatalogAvailable && !base) return []
			const profileType =
				profile.type ??
				(profile.inferenceProfileArn?.includes(":application-inference-profile/") ? "APPLICATION" : "SYSTEM_DEFINED")
			return [
				{
					kind: "inference-profile",
					invocationId: profile.inferenceProfileId,
					arn: profile.inferenceProfileArn,
					displayName: profile.inferenceProfileName?.trim() || profile.inferenceProfileId,
					providerName: base?.providerName,
					baseModelId: base?.baseModelId ?? resolveBaseModelId(profile),
					profileType,
					inputModalities: base?.inputModalities ?? ["TEXT"],
					outputModalities: base?.outputModalities ?? ["TEXT"],
					streaming: true,
					lifecycle: profile.status,
				},
			]
		})

		const deduplicated = new Map<string, BedrockTarget>()
		for (const target of [...foundationTargets, ...profileTargets]) {
			deduplicated.set(targetKey(target), target)
		}
		return {
			connectionVerified: foundationCatalogAvailable || profileCatalogAvailable,
			targets: [...deduplicated.values()].sort((left, right) => {
				if (left.kind !== right.kind) return left.kind === "foundation-model" ? -1 : 1
				return left.displayName.localeCompare(right.displayName)
			}),
			foundationModelCount: foundationTargets.length,
			inferenceProfileCount: profileTargets.length,
			inferenceProfilePages,
			warnings,
		}
	}
}
