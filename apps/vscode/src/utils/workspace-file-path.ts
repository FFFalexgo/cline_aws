import { stat } from "node:fs/promises"
import path from "node:path"
import { parseFilePath } from "@shared/file-path"

/** Find an existing file or directory in the open workspace roots. */
export async function findWorkspacePath(reference: string, roots: string[], preferredRoot?: string): Promise<string | undefined> {
	const parsed = parseFilePath(reference)
	if (!parsed) return undefined
	const value = parsed.replace(/[\\/]/g, path.sep)
	const orderedRoots = [...new Set([...(preferredRoot && roots.includes(preferredRoot) ? [preferredRoot] : []), ...roots])]
	const candidates = path.isAbsolute(value)
		? [path.normalize(value)]
		: orderedRoots.flatMap((root) => {
				const prefix = `${path.basename(root)}${path.sep}`
				return [
					path.resolve(root, value),
					...(value.startsWith(prefix) ? [path.resolve(root, value.slice(prefix.length))] : []),
				]
			})
	for (const candidate of new Set(candidates)) {
		const inWorkspace = roots.some((root) => {
			const relative = path.relative(root, candidate)
			return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
		})
		if (!inWorkspace) continue
		try {
			const info = await stat(candidate)
			if (info.isFile() || info.isDirectory()) return candidate
		} catch {
			// Missing paths remain ordinary text in chat.
		}
	}
	return undefined
}
