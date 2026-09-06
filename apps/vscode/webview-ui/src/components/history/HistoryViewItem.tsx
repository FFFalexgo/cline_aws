import { HistoryItem } from "@shared/HistoryItem"
import { StringRequest } from "@shared/proto/bedrock_coder/common"
import { DownloadIcon, MessageSquareIcon, StarIcon, TrashIcon } from "lucide-react"
import { memo } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TaskServiceClient } from "@/services/grpc-client"

type HistoryViewItemProps = {
	item: HistoryItem
	selectionMode: boolean
	selectedItems: string[]
	pendingFavoriteToggles: Record<string, boolean>
	handleDeleteHistoryItem: (id: string) => void
	toggleFavorite: (id: string, isCurrentlyFavorited: boolean) => void
	handleHistorySelect: (itemId: string, checked: boolean) => void
}

const HistoryViewItem = ({
	item,
	selectionMode,
	pendingFavoriteToggles,
	handleDeleteHistoryItem,
	toggleFavorite,
	handleHistorySelect,
	selectedItems,
}: HistoryViewItemProps) => {
	const isFavorited = pendingFavoriteToggles[item.id] ?? item.isFavorited ?? false
	const isSelected = selectedItems.includes(item.id)
	const date = new Date(item.ts)
	const dateLabel =
		date.toDateString() === new Date().toDateString()
			? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
			: date.toLocaleDateString(undefined, { month: "short", day: "numeric" })

	return (
		<div
			className={cn(
				"history-item group mx-2 flex items-center gap-1 rounded hover:bg-list-hover focus-within:bg-list-hover",
				{ "bg-list-hover": isSelected },
			)}>
			{selectionMode && (
				<input
					aria-label={`Select ${item.task}`}
					checked={isSelected}
					className="ml-2 shrink-0 accent-button-background"
					onChange={(event) => handleHistorySelect(item.id, event.target.checked)}
					type="checkbox"
				/>
			)}
			<Button
				className="min-w-0 flex-1 justify-start gap-2 px-2 py-1.5"
				onClick={() => {
					if (selectionMode) {
						handleHistorySelect(item.id, !isSelected)
						return
					}
					TaskServiceClient.showTaskWithId(StringRequest.create({ value: item.id })).catch((error) =>
						console.error("Error showing task:", error),
					)
				}}
				title={item.task}
				variant="ghost">
				{isFavorited ? (
					<StarIcon aria-label="Favorited" data-icon="inline-start" />
				) : (
					<MessageSquareIcon aria-hidden="true" data-icon="inline-start" />
				)}
				<span className="ph-no-capture min-w-0 truncate text-left">{item.task}</span>
			</Button>
			<div className="relative mr-2 flex h-7 w-20 shrink-0 items-center justify-end">
				<time
					className={cn("text-xs text-description", {
						"group-hover:invisible group-focus-within:invisible": !selectionMode,
					})}
					dateTime={date.toISOString()}
					title={date.toLocaleString()}>
					{dateLabel}
				</time>
				{!selectionMode && (
					<div className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
						<Button
							aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
							disabled={pendingFavoriteToggles[item.id] !== undefined}
							onClick={() => toggleFavorite(item.id, isFavorited)}
							size="xs"
							title={isFavorited ? "Remove from favorites" : "Add to favorites"}
							variant="ghost">
							<StarIcon data-icon="inline-start" />
						</Button>
						<Button
							aria-label="Export conversation"
							onClick={() => {
								TaskServiceClient.exportTaskWithId(StringRequest.create({ value: item.id })).catch((error) =>
									console.error("Failed to export task:", error),
								)
							}}
							size="xs"
							title="Export conversation"
							variant="ghost">
							<DownloadIcon data-icon="inline-start" />
						</Button>
						<Button
							aria-label="Delete conversation"
							disabled={isFavorited}
							onClick={() => handleDeleteHistoryItem(item.id)}
							size="xs"
							title={isFavorited ? "Remove from favorites before deleting" : "Delete conversation"}
							variant="ghost">
							<TrashIcon data-icon="inline-start" />
						</Button>
					</div>
				)}
			</div>
		</div>
	)
}

export default memo(HistoryViewItem)
