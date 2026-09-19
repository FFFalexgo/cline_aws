import { Empty, type StringRequest } from "@shared/proto/bedrock_coder/common"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType } from "@/shared/proto/host/window"
import type { Controller } from ".."
import { resolvePath } from "./resolvePath"

export async function revealPathInExplorer(controller: Controller, request: StringRequest): Promise<Empty> {
	const { value } = await resolvePath(controller, request)
	if (value) {
		await HostProvider.workspace.openInFileExplorerPanel({ path: value })
	} else {
		await HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: "This path is no longer available in the open workspace.",
		})
	}
	return Empty.create()
}
