/** Extract a local path from a chat reference without executing URI schemes. */
export function parseFilePath(reference: string): string | undefined {
	let value = reference.trim()
	if (!value || /[\r\n\0]/.test(value)) return undefined
	value = value.replace(/(?:#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?|:\d+(?::\d+)?(?:-\d+)?)$/, "")
	if (/^file:\/\//i.test(value)) {
		try {
			const uri = new URL(value)
			if (uri.hostname && uri.hostname !== "localhost") return undefined
			value = decodeURIComponent(uri.pathname).replace(/^\/([a-z]:\/)/i, "$1")
		} catch {
			return undefined
		}
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return undefined
	if (/^(?:\\\\|\/\/|#)/.test(value) || /[\r\n\0<>"|?*]/.test(value)) return undefined
	if (!/[\p{L}\p{N}_]/u.test(value)) return undefined
	return value
}
