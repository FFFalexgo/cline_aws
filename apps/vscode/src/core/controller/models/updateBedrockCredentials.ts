import { Empty } from "@shared/proto/bedrock_coder/common"
import type { UpdateBedrockCredentialsRequest } from "@shared/proto/bedrock_coder/models"
import type { Controller } from "../index"

function trimmed(value: string): string | undefined {
	const normalized = value.trim()
	return normalized || undefined
}

export async function updateBedrockCredentials(controller: Controller, request: UpdateBedrockCredentialsRequest): Promise<Empty> {
	if (request.clear) {
		controller.stateManager.setSecretsBatch({
			awsAccessKeyId: undefined,
			awsSecretAccessKey: undefined,
			awsSessionToken: undefined,
		})
	} else {
		const accessKeyId = trimmed(request.accessKeyId)
		const secretAccessKey = trimmed(request.secretAccessKey)
		if (!accessKeyId || !secretAccessKey) {
			throw new Error("An access key ID and secret access key are required.")
		}
		controller.stateManager.setSecretsBatch({
			awsAccessKeyId: accessKeyId,
			awsSecretAccessKey: secretAccessKey,
			awsSessionToken: trimmed(request.sessionToken),
		})
	}

	await controller.stateManager.flushPendingState()
	await controller.postStateToWebview()
	void controller.bedrockStartup.connectionChanged()
	return Empty.create()
}
