import { ModelsApiConfiguration as ProtoApiConfiguration } from "@shared/proto/bedrock_coder/models"
import { type ApiConfiguration, BEDROCK_DEFAULT_MODEL_ID, BEDROCK_DEFAULT_REGION } from "../../api"

export function convertApiConfigurationToProto(config: ApiConfiguration): ProtoApiConfiguration {
	return ProtoApiConfiguration.create({
		ulid: config.ulid,
		awsRegion: config.awsRegion,
		awsAuthMode: config.awsAuthMode,
		awsProfile: config.awsProfile,
		awsBedrockEndpoint: config.awsBedrockEndpoint,
		awsBedrockCaBundlePath: config.awsBedrockCaBundlePath,
		awsBedrockControlPlaneEndpoint: config.awsBedrockControlPlaneEndpoint,
		planModeApiModelId: config.planModeApiModelId,
		planModeThinkingBudgetTokens: config.planModeThinkingBudgetTokens,
		planModeReasoningEffort: config.planModeReasoningEffort,
		actModeApiModelId: config.actModeApiModelId,
		actModeThinkingBudgetTokens: config.actModeThinkingBudgetTokens,
		actModeReasoningEffort: config.actModeReasoningEffort,
	})
}

export function convertProtoToApiConfiguration(protoConfig: ProtoApiConfiguration): ApiConfiguration {
	return {
		ulid: protoConfig.ulid,
		awsRegion: protoConfig.awsRegion ?? BEDROCK_DEFAULT_REGION,
		awsAuthMode:
			protoConfig.awsAuthMode === "default" ||
			protoConfig.awsAuthMode === "profile" ||
			protoConfig.awsAuthMode === "access-key"
				? protoConfig.awsAuthMode
				: undefined,
		awsProfile: protoConfig.awsProfile,
		awsBedrockEndpoint: protoConfig.awsBedrockEndpoint,
		awsBedrockCaBundlePath: protoConfig.awsBedrockCaBundlePath,
		awsBedrockControlPlaneEndpoint: protoConfig.awsBedrockControlPlaneEndpoint,
		planModeApiModelId: protoConfig.planModeApiModelId ?? BEDROCK_DEFAULT_MODEL_ID,
		planModeThinkingBudgetTokens: protoConfig.planModeThinkingBudgetTokens,
		planModeReasoningEffort: protoConfig.planModeReasoningEffort,
		actModeApiModelId: protoConfig.actModeApiModelId ?? BEDROCK_DEFAULT_MODEL_ID,
		actModeThinkingBudgetTokens: protoConfig.actModeThinkingBudgetTokens,
		actModeReasoningEffort: protoConfig.actModeReasoningEffort,
	}
}
