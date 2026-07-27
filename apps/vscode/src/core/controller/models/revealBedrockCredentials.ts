import type { EmptyRequest } from "@shared/proto/bedrock_coder/common"
import { BedrockCredentials } from "@shared/proto/bedrock_coder/models"
import type { Controller } from "../index"

export async function revealBedrockCredentials(controller: Controller, _request: EmptyRequest): Promise<BedrockCredentials> {
	return BedrockCredentials.create({
		accessKeyId: controller.stateManager.getSecretKey("awsAccessKeyId") ?? "",
		secretAccessKey: controller.stateManager.getSecretKey("awsSecretAccessKey") ?? "",
		sessionToken: controller.stateManager.getSecretKey("awsSessionToken") ?? "",
	})
}
