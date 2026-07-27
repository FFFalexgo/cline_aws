import {
	type FoundationModelSummary,
	GetInferenceProfileCommand,
	type GetInferenceProfileCommandOutput,
	type InferenceProfileSummary,
	ListFoundationModelsCommand,
	ListInferenceProfilesCommand,
} from "@aws-sdk/client-bedrock"
import type { BedrockTarget } from "@shared/bedrock-startup"

export interface BedrockControlPlaneClient {
	send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>
}

export interface BedrockDiscoveryResult {
	targets: BedrockTarget[]
	foundationModelCount: number
	inferenceProfileCount: number
	inferenceProfilePages: number
	warnings?: string[]
}

function normalized(values: readonly string[] | undefined): string[] {
	return (values ?? []).map((value) => value.toUpperCase())
}

export function isCompatibleFoundationModel(summary: FoundationModelSummary): boolean {
	const lifecycle = summary.modelLifecycle?.status
	const input = normalized(summary.inputModalities)
	const output = normalized(summary.outputModalities)
	const inference = normalized(summary.inferenceTypesSupported)
	return (
		Boolean(summary.modelId) &&
		(!lifecycle || lifecycle === "ACTIVE") &&
		input.includes("TEXT") &&
		output.includes("TEXT") &&
		summary.responseStreamingSupported === true &&
		inference.includes("ON_DEMAND")
	)
}

export function foundationTarget(summary: FoundationModelSummary): BedrockTarget | undefined {
	if (!isCompatibleFoundationModel(summary) || !summary.modelId) return undefined
	return {
		kind: "foundation-model",
		invocationId: summary.modelId,
		arn: summary.modelArn,
		displayName: summary.modelName?.trim() || summary.modelId,
		providerName: summary.providerName,
		baseModelId: summary.modelId,
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

export class BedrockDiscoveryService {
	constructor(private readonly client: BedrockControlPlaneClient) {}

	async discover(
		signal: AbortSignal,
		onStage?: (stage: "discoveringModels" | "discoveringProfiles") => void,
	): Promise<BedrockDiscoveryResult> {
		const warnings = new Set<string>()
		onStage?.("discoveringModels")
		let foundationCatalogAvailable = false
		let foundationFailure: unknown
		let foundationSummaries: FoundationModelSummary[] = []
		try {
			const foundationResponse = (await this.client.send(new ListFoundationModelsCommand({}), {
				abortSignal: signal,
			})) as { modelSummaries?: FoundationModelSummary[] }
			foundationSummaries = foundationResponse.modelSummaries ?? []
			foundationCatalogAvailable = true
		} catch (error) {
			throwIfCancelled(error, signal)
			foundationFailure = error
			warnings.add("Foundation-model discovery failed; showing inference profiles discovered independently.")
		}
		const foundationTargets = foundationSummaries.flatMap((summary) => {
			const target = foundationTarget(summary)
			return target ? [target] : []
		})

		onStage?.("discoveringProfiles")
		const profileSummaries: InferenceProfileSummary[] = []
		let nextToken: string | undefined
		let inferenceProfilePages = 0
		let profileCatalogAvailable = false
		let profileFailure: unknown
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
			profileFailure = error
			warnings.add("Inference-profile discovery failed; showing foundation models discovered independently.")
		}

		if (!foundationCatalogAvailable && !profileCatalogAvailable) {
			throw foundationFailure ?? profileFailure ?? new Error("Bedrock model discovery failed.")
		}

		const hydratedProfiles = await Promise.all(
			profileSummaries.map(async (profile): Promise<InferenceProfileSummary> => {
				if ((profile.models?.length ?? 0) > 0 || !profile.inferenceProfileId) return profile
				try {
					const detail = (await this.client.send(
						new GetInferenceProfileCommand({
							inferenceProfileIdentifier: profile.inferenceProfileId,
						}),
						{ abortSignal: signal },
					)) as GetInferenceProfileCommandOutput
					return {
						...profile,
						models: detail.models,
						inferenceProfileArn: detail.inferenceProfileArn ?? profile.inferenceProfileArn,
						inferenceProfileId: detail.inferenceProfileId ?? profile.inferenceProfileId,
						inferenceProfileName: detail.inferenceProfileName ?? profile.inferenceProfileName,
						status: detail.status ?? profile.status,
						type: detail.type ?? profile.type,
					}
				} catch (error) {
					throwIfCancelled(error, signal)
					warnings.add("Some inference-profile details could not be loaded.")
					return profile
				}
			}),
		)

		const foundationByReference = new Map<string, BedrockTarget>()
		for (const target of foundationTargets) {
			foundationByReference.set(target.invocationId, target)
			if (target.arn) foundationByReference.set(target.arn, target)
		}
		const profilesByReference = new Map<string, InferenceProfileSummary>()
		for (const profile of hydratedProfiles) {
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

		const profileTargets = hydratedProfiles.flatMap((profile): BedrockTarget[] => {
			if (profile.status !== "ACTIVE" || !profile.inferenceProfileId) return []
			const profileType =
				profile.type ??
				(profile.inferenceProfileArn?.includes(":application-inference-profile/") ? "APPLICATION" : "SYSTEM_DEFINED")
			if (profileType !== "SYSTEM_DEFINED" && profileType !== "APPLICATION") return []
			if (profileType === "APPLICATION" && !profile.inferenceProfileArn) return []
			const base = resolveBase(profile)
			const fallbackBaseModelId = foundationCatalogAvailable ? undefined : resolveBaseModelId(profile)
			if (foundationCatalogAvailable && !base) return []
			return [
				{
					kind: "inference-profile",
					invocationId:
						profileType === "APPLICATION" ? (profile.inferenceProfileArn as string) : profile.inferenceProfileId,
					arn: profile.inferenceProfileArn,
					displayName: profile.inferenceProfileName?.trim() || profile.inferenceProfileId,
					providerName: base?.providerName,
					baseModelId: base?.baseModelId ?? fallbackBaseModelId,
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
			targets: [...deduplicated.values()].sort((left, right) => {
				if (left.kind !== right.kind) return left.kind === "foundation-model" ? -1 : 1
				return left.displayName.localeCompare(right.displayName)
			}),
			foundationModelCount: foundationTargets.length,
			inferenceProfileCount: profileTargets.length,
			inferenceProfilePages,
			warnings: [...warnings],
		}
	}
}
