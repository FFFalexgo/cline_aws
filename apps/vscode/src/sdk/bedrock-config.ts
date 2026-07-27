import type { ProviderSettings } from "@bedrock-coder/core"
import type { BedrockConnection, BedrockCredentialProvider, ProviderConfig } from "@bedrock-coder/llms"
import { type ApiConfiguration, BEDROCK_DEFAULT_REGION } from "@shared/api"
import type { StateManager } from "@/core/storage/StateManager"

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export type AwsAuthMode = "default" | "profile" | "access-key"

export function resolveAwsAuthMode(configuration: ApiConfiguration): AwsAuthMode {
	if (
		configuration.awsAuthMode === "default" ||
		configuration.awsAuthMode === "profile" ||
		configuration.awsAuthMode === "access-key"
	) {
		return configuration.awsAuthMode
	}
	return optionalString(configuration.awsProfile) ? "profile" : "default"
}

export function createStoredBedrockCredentialProvider(stateManager: StateManager): BedrockCredentialProvider | undefined {
	const configuration = stateManager.getApiConfiguration()
	if (resolveAwsAuthMode(configuration) !== "access-key") return undefined

	const accessKeyId = optionalString(stateManager.getSecretKey("awsAccessKeyId"))
	const secretAccessKey = optionalString(stateManager.getSecretKey("awsSecretAccessKey"))
	const sessionToken = optionalString(stateManager.getSecretKey("awsSessionToken"))
	if (!accessKeyId || !secretAccessKey) {
		return async () => {
			throw new Error("AWS_ACCESS_KEYS: Enter and save an access key ID and secret access key in Bedrock settings.")
		}
	}

	return async () => ({
		accessKeyId,
		secretAccessKey,
		...(sessionToken ? { sessionToken } : {}),
	})
}

export function buildBedrockConnection(
	configuration: ApiConfiguration,
	credentialProvider?: BedrockCredentialProvider,
): BedrockConnection {
	const credentialSource = resolveAwsAuthMode(configuration)
	return {
		region: optionalString(configuration.awsRegion) ?? BEDROCK_DEFAULT_REGION,
		profile: credentialSource === "profile" ? optionalString(configuration.awsProfile) : undefined,
		credentialProvider: credentialSource === "access-key" ? credentialProvider : undefined,
		credentialSource,
		endpoint: optionalString(configuration.awsBedrockEndpoint),
		caBundlePath: optionalString(configuration.awsBedrockCaBundlePath),
		controlPlaneEndpoint: optionalString(configuration.awsBedrockControlPlaneEndpoint),
	}
}

export type BedrockProviderConfig = Pick<ProviderConfig, "providerId" | "modelId" | "connection" | "workspaceRoot">

export function buildBedrockProviderConfig(
	configuration: ApiConfiguration,
	modelId: string,
	workspaceRoot?: string,
	credentialProvider?: BedrockCredentialProvider,
): BedrockProviderConfig {
	return {
		providerId: "bedrock",
		modelId,
		connection: buildBedrockConnection(configuration, credentialProvider),
		workspaceRoot,
	}
}

export function buildBedrockProviderSettings(configuration: ApiConfiguration, modelId: string): ProviderSettings {
	return {
		provider: "bedrock",
		model: modelId,
		connection: buildBedrockConnection(configuration),
	}
}
