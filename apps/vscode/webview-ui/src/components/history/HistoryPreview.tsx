import { StringRequest } from "@shared/proto/bedrock_coder/common"
import { ChevronRightIcon, MessageSquareIcon, StarIcon } from "lucide-react"
import { memo } from "react"
import { Button } from "@/components/ui/button"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { TaskServiceClient } from "@/services/grpc-client"

type HistoryPreviewProps = {
	showHistoryView: () => void
}

const HistoryPreview = ({ showHistoryView }: HistoryPreviewProps) => {
	const { taskHistory } = useExtensionState()
	const recentTasks = taskHistory.filter((item) => item.ts && item.task).slice(0, 5)

	return (
		<section aria-label="Recent conversations" className="shrink-0 px-3 pb-3">
			<div className="flex items-center justify-between px-2 py-2">
				<span className="text-xs text-description">Recent conversations</span>
				<Button aria-label="View all history" onClick={showHistoryView} size="xs" variant="ghost">
					View all
					<ChevronRightIcon data-icon="inline-end" />
				</Button>
			</div>
			{recentTasks.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-0.5 p-0">
					{recentTasks.map((item) => (
						<li key={item.id}>
							<Button
								className="w-full justify-start gap-2 px-2 py-1.5"
								onClick={() => {
									TaskServiceClient.showTaskWithId(StringRequest.create({ value: item.id })).catch((error) =>
										console.error("Error showing task:", error),
									)
								}}
								title={item.task}
								variant="ghost">
								{item.isFavorited ? (
									<StarIcon aria-label="Favorited" data-icon="inline-start" />
								) : (
									<MessageSquareIcon aria-hidden="true" data-icon="inline-start" />
								)}
								<span className="ph-no-capture min-w-0 flex-1 truncate text-left">{item.task}</span>
								<time className="shrink-0 text-xs text-description" dateTime={new Date(item.ts).toISOString()}>
									{new Date(item.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
								</time>
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="px-2 text-xs text-description">No recent conversations</p>
			)}
		</section>
	)
}

export default memo(HistoryPreview)
