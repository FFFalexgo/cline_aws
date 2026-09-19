import { parseFilePath } from "@shared/file-path"
import type { Node } from "unist"

interface MarkdownNode extends Node {
	value?: string
	url?: string
	children?: MarkdownNode[]
	data?: { hProperties?: Record<string, string> }
}

export function remarkWorkspacePaths() {
	return (tree: Node) => {
		const walk = (node: MarkdownNode) => {
			if (["link", "linkReference", "code", "html"].includes(node.type)) return
			if (node.type === "inlineCode" && node.value && parseFilePath(node.value)) {
				node.data = { ...node.data, hProperties: { ...node.data?.hProperties, "data-workspace-path": node.value } }
			}
			if (!node.children) return
			node.children = node.children.flatMap((child) => {
				if (child.type !== "text" || !child.value) {
					walk(child)
					return [child]
				}
				const parts: MarkdownNode[] = []
				let offset = 0
				for (const match of child.value.matchAll(/\S+/g)) {
					const token = match[0].replace(/^[([{]+/, "").replace(/[.,;!?\])}]+$/, "")
					if (!/[\\/.]/.test(token) || !parseFilePath(token)) continue
					const start = match.index + match[0].indexOf(token)
					if (start > offset) parts.push({ type: "text", value: child.value.slice(offset, start) })
					parts.push({ type: "link", url: token, children: [{ type: "text", value: token }] })
					offset = start + token.length
				}
				if (offset < child.value.length) parts.push({ type: "text", value: child.value.slice(offset) })
				return parts
			})
		}
		walk(tree)
	}
}
