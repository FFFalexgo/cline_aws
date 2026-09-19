import { parseFilePath } from "@shared/file-path"
import { type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { FileServiceClient } from "@/services/grpc-client"

export function WorkspacePathLink({ reference, children }: { reference: string; children: ReactNode }) {
	const [resolved, setResolved] = useState<{ reference: string; path: string }>()
	useEffect(() => {
		if (!parseFilePath(reference)) return
		let cancelled = false
		FileServiceClient.resolvePath({ value: reference })
			.then(({ value }) => {
				if (!cancelled) setResolved({ reference, path: value })
			})
			.catch(() => {
				if (!cancelled) setResolved(undefined)
			})
		return () => {
			cancelled = true
		}
	}, [reference])

	if (resolved?.reference !== reference || !resolved.path) return <>{children}</>
	return (
		<Button
			className="inline max-w-full whitespace-normal text-left align-baseline [overflow-wrap:anywhere]"
			onClick={() => {
				FileServiceClient.revealPathInExplorer({ value: resolved.path }).catch((error) =>
					console.error("Failed to reveal path in Explorer:", error),
				)
			}}
			title={`Reveal ${reference} in Explorer`}
			type="button"
			variant="link">
			{children}
		</Button>
	)
}
