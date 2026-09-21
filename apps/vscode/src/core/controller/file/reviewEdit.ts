import { Empty } from "@shared/proto/bedrock_coder/common"
import type { EditReviewRequest } from "@shared/proto/bedrock_coder/file"
import type { Controller } from ".."

export async function reviewEdit(controller: Controller, request: EditReviewRequest): Promise<Empty> {
	await controller.reviewEdit(request)
	return Empty.create()
}
