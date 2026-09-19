import { type StringRequest, String as StringResponse } from "@shared/proto/bedrock_coder/common"
import { getWorkspacePath } from "@utils/path"
import { findWorkspacePath } from "@utils/workspace-file-path"
import { HostProvider } from "@/hosts/host-provider"
import type { Controller } from ".."

export async function resolvePath(_controller: Controller, request: StringRequest): Promise<StringResponse> {
	const { paths } = await HostProvider.workspace.getWorkspacePaths({})
	const value = await findWorkspacePath(request.value, paths, await getWorkspacePath())
	return StringResponse.create({ value: value ?? "" })
}
