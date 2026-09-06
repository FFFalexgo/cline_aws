import { EmptyRequest, StringArrayRequest } from "@shared/proto/bedrock_coder/common"
import { GetTaskHistoryRequest, TaskFavoriteRequest, type TaskItem } from "@shared/proto/bedrock_coder/task"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import Fuse, { FuseResult } from "fuse.js"
import { FunnelIcon, XIcon } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GroupedVirtuoso } from "react-virtuoso"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { TaskServiceClient } from "@/services/grpc-client"
import { formatSize } from "@/utils/format"
import ViewHeader from "../common/ViewHeader"
import HistoryViewItem from "./HistoryViewItem"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostRelevant"

const HISTORY_FILTERS = {
	newest: "Newest",
	oldest: "Oldest",
	mostRelevant: "Most Relevant",
	workspaceOnly: "Workspace Only",
	favoritesOnly: "Favorites Only",
}

const HISTORY_PAGE_SIZE = 50

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const extensionStateContext = useExtensionState()
	const { taskHistory, onRelinquishControl, environment } = extensionStateContext
	const [searchQuery, setSearchQuery] = useState("")
	const [sortOption, setSortOption] = useState<SortOption>("newest")
	const [lastNonRelevantSort, setLastNonRelevantSort] = useState<SortOption | null>("newest")
	const [deleteAllDisabled, setDeleteAllDisabled] = useState(false)
	const [selectedItems, setSelectedItems] = useState<string[]>([])
	const [selectionMode, setSelectionMode] = useState(false)
	const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
	const [showCurrentWorkspaceOnly, setShowCurrentWorkspaceOnly] = useState(false)

	// Keep track of pending favorite toggle operations
	const [pendingFavoriteToggles, setPendingFavoriteToggles] = useState<Record<string, boolean>>({})

	// Load filtered task history with gRPC
	const [tasks, setTasks] = useState<TaskItem[]>([])
	const [hasMoreTasks, setHasMoreTasks] = useState(false)
	const [nextHistoryOffset, setNextHistoryOffset] = useState(0)
	const [isLoadingHistory, setIsLoadingHistory] = useState(false)
	const isLoadingHistoryRef = useRef(false)
	const historyRequestIdRef = useRef(0)
	const hasRequestedTotalTasksSizeRef = useRef(false)

	// Load and refresh task history
	const loadTaskHistory = useCallback(
		async (offset = 0) => {
			if (offset > 0 && isLoadingHistoryRef.current) {
				return
			}

			const requestId = ++historyRequestIdRef.current
			isLoadingHistoryRef.current = true
			setIsLoadingHistory(true)
			try {
				const startedAt = performance.now()
				const response = await TaskServiceClient.getTaskHistory(
					GetTaskHistoryRequest.create({
						favoritesOnly: showFavoritesOnly,
						searchQuery: searchQuery || undefined,
						sortBy: sortOption,
						currentWorkspaceOnly: showCurrentWorkspaceOnly,
						limit: HISTORY_PAGE_SIZE,
						offset,
					}),
				)
				console.log(
					`[HistoryPerf] getTaskHistory offset=${offset} tasks=${response.tasks?.length ?? 0} hasMore=${response.hasMore} took ${Math.round(performance.now() - startedAt)}ms`,
				)
				if (requestId !== historyRequestIdRef.current) {
					return
				}
				const pageTasks = response.tasks || []
				setTasks((currentTasks) => {
					if (offset === 0) {
						return pageTasks
					}

					const mergedTasks = new Map(currentTasks.map((task) => [task.id, task]))
					for (const task of pageTasks) {
						mergedTasks.set(task.id, task)
					}
					return Array.from(mergedTasks.values())
				})
				setHasMoreTasks(response.hasMore)
				setNextHistoryOffset(offset + HISTORY_PAGE_SIZE)
			} catch (error) {
				console.error("Error loading task history:", error)
			} finally {
				if (requestId === historyRequestIdRef.current) {
					isLoadingHistoryRef.current = false
					setIsLoadingHistory(false)
				}
			}
		},
		[showFavoritesOnly, showCurrentWorkspaceOnly, searchQuery, sortOption],
	)

	const loadMoreTaskHistory = useCallback(() => {
		if (!hasMoreTasks || isLoadingHistory) {
			return
		}
		loadTaskHistory(nextHistoryOffset)
	}, [hasMoreTasks, isLoadingHistory, loadTaskHistory, nextHistoryOffset])

	// Load when filters change
	useEffect(() => {
		setTasks([])
		setHasMoreTasks(false)
		setNextHistoryOffset(0)
		loadTaskHistory(0)
	}, [loadTaskHistory, showFavoritesOnly, showCurrentWorkspaceOnly])

	const toggleFavorite = useCallback(
		async (taskId: string, currentValue: boolean) => {
			const nextValue = !currentValue

			// Optimistic UI update
			setPendingFavoriteToggles((prev) => ({ ...prev, [taskId]: nextValue }))

			try {
				await TaskServiceClient.toggleTaskFavorite(
					TaskFavoriteRequest.create({
						taskId,
						isFavorited: nextValue,
					}),
				)

				setTasks((currentTasks) =>
					currentTasks.map((task) => (task.id === taskId ? { ...task, isFavorited: nextValue } : task)),
				)

				// Refresh if either filter is active to ensure proper combined filtering
				if (showFavoritesOnly || showCurrentWorkspaceOnly) {
					await loadTaskHistory(0)
				}
			} catch (err) {
				console.error(`[FAVORITE_TOGGLE_UI] Error for task ${taskId}:`, err)
				// Revert optimistic update
				setPendingFavoriteToggles((prev) => {
					const updated = { ...prev }
					delete updated[taskId]
					return updated
				})
			} finally {
				// Clean up pending state after 1 second
				setTimeout(() => {
					setPendingFavoriteToggles((prev) => {
						const updated = { ...prev }
						delete updated[taskId]
						return updated
					})
				}, 1000)
			}
		},
		[showFavoritesOnly, showCurrentWorkspaceOnly, loadTaskHistory],
	)

	// Use the onRelinquishControl hook instead of message event
	useEffect(() => {
		return onRelinquishControl(() => {
			setDeleteAllDisabled(false)
		})
	}, [onRelinquishControl])

	const { totalTasksSize, setTotalTasksSize } = extensionStateContext

	const fetchTotalTasksSize = useCallback(async () => {
		try {
			const startedAt = performance.now()
			const response = await TaskServiceClient.getTotalTasksSize(EmptyRequest.create({}))
			console.log(`[HistoryPerf] getTotalTasksSize took ${Math.round(performance.now() - startedAt)}ms`)
			if (response && typeof response.value === "number") {
				setTotalTasksSize?.(response.value || 0)
			}
		} catch (error) {
			console.error("Error getting total tasks size:", error)
		}
	}, [setTotalTasksSize])

	// Defer the expensive recursive task/checkpoint size scan until after the first
	// history page loads, so it does not compete with the initial history request.
	useEffect(() => {
		if (hasRequestedTotalTasksSizeRef.current || isLoadingHistory || nextHistoryOffset === 0 || totalTasksSize !== null) {
			return
		}

		hasRequestedTotalTasksSizeRef.current = true
		const timeout = window.setTimeout(() => {
			void fetchTotalTasksSize()
		}, 750)
		return () => window.clearTimeout(timeout)
	}, [fetchTotalTasksSize, isLoadingHistory, nextHistoryOffset, totalTasksSize])

	useEffect(() => {
		if (searchQuery && sortOption !== "mostRelevant" && !lastNonRelevantSort) {
			setLastNonRelevantSort(sortOption)
			setSortOption("mostRelevant")
		} else if (!searchQuery && sortOption === "mostRelevant" && lastNonRelevantSort) {
			setSortOption(lastNonRelevantSort)
			setLastNonRelevantSort(null)
		}
	}, [searchQuery, sortOption, lastNonRelevantSort])

	const handleHistorySelect = useCallback((itemId: string, checked: boolean) => {
		setSelectedItems((prev) => {
			if (checked) {
				return [...prev, itemId]
			}
			return prev.filter((id) => id !== itemId)
		})
	}, [])

	const handleDeleteHistoryItem = useCallback(
		(id: string) => {
			TaskServiceClient.deleteTasksWithIds(StringArrayRequest.create({ value: [id] }))
				.then(async () => {
					await loadTaskHistory(0)
					await fetchTotalTasksSize()
				})
				.catch((error) => console.error("Error deleting task:", error))
		},
		[fetchTotalTasksSize, loadTaskHistory],
	)

	const handleDeleteSelectedHistoryItems = useCallback(
		(ids: string[]) => {
			if (ids.length > 0) {
				TaskServiceClient.deleteTasksWithIds(StringArrayRequest.create({ value: ids }))
					.then(async () => {
						await loadTaskHistory(0)
						setSelectedItems([])
						await fetchTotalTasksSize()
					})
					.catch((error) => console.error("Error deleting tasks:", error))
			}
		},
		[fetchTotalTasksSize, loadTaskHistory],
	)

	const handleDeleteAllHistory = useCallback(() => {
		setDeleteAllDisabled(true)
		TaskServiceClient.deleteAllTaskHistory(EmptyRequest.create({}))
			.then(async () => {
				await loadTaskHistory(0)
				setSelectedItems([])
				await fetchTotalTasksSize()
			})
			.catch((error) => console.error("Error deleting task history:", error))
			.finally(() => setDeleteAllDisabled(false))
	}, [fetchTotalTasksSize, loadTaskHistory])

	const fuse = useMemo(() => {
		return new Fuse(tasks, {
			keys: ["task"],
			threshold: 0.6,
			shouldSort: true,
			isCaseSensitive: false,
			ignoreLocation: false,
			includeMatches: true,
			minMatchCharLength: 1,
		})
	}, [tasks])

	const taskHistorySearchResults = useMemo(() => {
		const results = searchQuery
			? fuse
					.search(searchQuery)
					?.filter(({ matches }) => matches && matches.length)
					.map(({ item }) => item)
			: [...tasks]

		results.sort((a, b) => {
			switch (sortOption) {
				case "oldest":
					return a.ts - b.ts
				case "mostRelevant":
					// NOTE: you must never sort directly on object since it will cause members to be reordered
					return searchQuery ? 0 : b.ts - a.ts // Keep fuse order if searching, otherwise sort by newest
				default:
					return b.ts - a.ts
			}
		})

		return results
	}, [tasks, searchQuery, fuse, sortOption])

	// Use local calendar boundaries so date groups also work across daylight saving changes.
	const { groupedTasks, groupCounts, groupLabels } = useMemo(() => {
		const isDateSort = sortOption === "newest" || sortOption === "oldest"

		if (!isDateSort) {
			// No grouping for non-date sorts
			return {
				groupedTasks: taskHistorySearchResults,
				groupCounts: [taskHistorySearchResults.length],
				groupLabels: [] as string[],
			}
		}

		const today = new Date()
		today.setHours(0, 0, 0, 0)
		const yesterday = new Date(today)
		yesterday.setDate(yesterday.getDate() - 1)
		const lastWeek = new Date(today)
		lastWeek.setDate(lastWeek.getDate() - 7)
		const groups: { tasks: TaskItem[]; label: string }[] = []
		for (const task of taskHistorySearchResults) {
			const label =
				task.ts >= today.getTime()
					? "Today"
					: task.ts >= yesterday.getTime()
						? "Yesterday"
						: task.ts >= lastWeek.getTime()
							? "Previous 7 days"
							: "Older"
			const lastGroup = groups[groups.length - 1]
			if (lastGroup?.label === label) {
				lastGroup.tasks.push(task)
			} else {
				groups.push({ tasks: [task], label })
			}
		}

		return {
			groupedTasks: groups.flatMap((g) => g.tasks),
			groupCounts: groups.map((g) => g.tasks.length),
			groupLabels: groups.map((g) => g.label),
		}
	}, [taskHistorySearchResults, sortOption])

	// Calculate total size of selected items
	const selectedItemsSize = useMemo(() => {
		if (selectedItems.length === 0) {
			return 0
		}

		return tasks.filter((item) => selectedItems.includes(item.id)).reduce((total, item) => total + (item.size || 0), 0)
	}, [selectedItems, tasks])

	const handleBatchHistorySelect = useCallback(
		(selectAll: boolean) => {
			if (selectAll) {
				setSelectedItems(taskHistorySearchResults.map((item) => item.id))
			} else {
				setSelectedItems([])
			}
		},
		[taskHistorySearchResults],
	)

	return (
		<div className="fixed overflow-hidden inset-0 flex flex-col w-full">
			{/* HEADER */}
			<ViewHeader environment={environment} onDone={onDone} title="History" />

			{/* FILTERS */}
			<div className="flex flex-col gap-3 px-3">
				{/* REPLACE VSCODE RADIO GROUP */}
				<div className="flex justify-between items-center gap-2">
					{/* SEARCH BOX */}
					<VSCodeTextField
						aria-label="Search conversations"
						className="w-full"
						onInput={(e) => {
							const newValue = (e.target as HTMLInputElement)?.value
							setSearchQuery(newValue)
							if (newValue && !searchQuery && sortOption !== "mostRelevant") {
								setLastNonRelevantSort(sortOption)
								setSortOption("mostRelevant")
							}
						}}
						placeholder="Search conversations..."
						value={searchQuery}>
						<div className="codicon codicon-search opacity-80 mt-0.5 !text-sm" slot="start" />
						{searchQuery && (
							<Button
								aria-label="Clear search"
								onClick={() => setSearchQuery("")}
								size="xs"
								slot="end"
								variant="ghost">
								<XIcon data-icon="inline-start" />
							</Button>
						)}
					</VSCodeTextField>
					<Select
						onValueChange={(value) => {
							// Handle sort options
							if (value === "newest" || value === "oldest" || value === "mostRelevant") {
								if (value === "mostRelevant" && !searchQuery) {
									// Don't allow selecting mostRelevant without a search query
									return
								}
								setSortOption(value as SortOption)
								if (value !== "mostRelevant") {
									setLastNonRelevantSort(value as SortOption)
								}
							}
							// Handle filter toggles
							else if (value === "workspaceOnly") {
								setShowCurrentWorkspaceOnly(!showCurrentWorkspaceOnly)
							} else if (value === "favoritesOnly") {
								setShowFavoritesOnly(!showFavoritesOnly)
							}
						}}
						value={sortOption}>
						<SelectTrigger aria-label="Sort and filter history" className="shrink-0" showIcon={false}>
							<FunnelIcon />
						</SelectTrigger>
						<SelectContent position="popper">
							<SelectGroup>
								{Object.entries(HISTORY_FILTERS).map(([key, value]) => {
									const isSortOption = ["newest", "oldest", "mostRelevant"].includes(key)
									const isFilterOption = ["workspaceOnly", "favoritesOnly"].includes(key)
									const isSelected = isSortOption
										? sortOption === key
										: key === "workspaceOnly"
											? showCurrentWorkspaceOnly
											: key === "favoritesOnly"
												? showFavoritesOnly
												: false
									const isDisabled = key === "mostRelevant" && !searchQuery

									return (
										<SelectItem
											className={isSelected ? "bg-button-background/30" : ""}
											disabled={isDisabled}
											key={key}
											value={key}>
											<span className="flex items-center gap-2">
												{isFilterOption && (
													<span
														className={`codicon ${
															key === "workspaceOnly" ? "codicon-folder" : "codicon-star-full"
														} ${isSelected ? "text-button-background" : ""}`}
													/>
												)}
												{value}
											</span>
										</SelectItem>
									)
								})}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* HISTORY ITEMS */}
			<div className="min-h-0 flex-1 m-0 w-full py-2">
				{groupedTasks.length === 0 && (
					<p className="px-5 py-6 text-xs text-description" role="status">
						{isLoadingHistory
							? "Loading conversations..."
							: searchQuery || showFavoritesOnly || showCurrentWorkspaceOnly
								? "No matching conversations"
								: "No saved conversations yet"}
					</p>
				)}
				<GroupedVirtuoso
					className="flex-grow overflow-y-scroll"
					components={{
						Footer: () =>
							hasMoreTasks ? (
								<div className="px-4 py-3 text-center text-xs text-description">
									{isLoadingHistory ? "Loading..." : ""}
								</div>
							) : null,
					}}
					endReached={loadMoreTaskHistory}
					groupContent={(index) =>
						groupLabels[index] ? (
							<div className="px-4 pt-4 pb-1.5 text-xs text-description bg-sidebar-background">
								{groupLabels[index]}
							</div>
						) : null
					}
					groupCounts={groupCounts}
					itemContent={(index) => {
						const item = groupedTasks[index]
						return (
							<HistoryViewItem
								handleDeleteHistoryItem={handleDeleteHistoryItem}
								handleHistorySelect={handleHistorySelect}
								item={item}
								pendingFavoriteToggles={pendingFavoriteToggles}
								selectedItems={selectedItems}
								selectionMode={selectionMode}
								toggleFavorite={toggleFavorite}
							/>
						)
					}}
				/>
			</div>

			{/* FOOTER */}
			<div className="px-3 py-2 border-t border-t-border-panel">
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs text-description">
						{selectionMode ? `${selectedItems.length} selected` : "Saved conversations"}
					</span>
					<Button
						onClick={() => {
							setSelectionMode(!selectionMode)
							setSelectedItems([])
						}}
						size="sm"
						variant="ghost">
						{selectionMode ? "Cancel" : "Select"}
					</Button>
				</div>
				{selectionMode && (
					<>
						<div className="flex gap-2.5 mb-2.5">
							<Button className="flex-1" onClick={() => handleBatchHistorySelect(true)} variant="secondary">
								Select All
							</Button>
							<Button className="flex-1" onClick={() => handleBatchHistorySelect(false)} variant="secondary">
								Select None
							</Button>
						</div>
						{selectedItems.length > 0 ? (
							<Button
								aria-label="Delete selected items"
								className="w-full"
								onClick={() => {
									handleDeleteSelectedHistoryItems(selectedItems)
								}}
								variant="danger">
								Delete {selectedItems.length > 1 ? selectedItems.length : ""} Selected
								{selectedItemsSize > 0 ? ` (${formatSize(selectedItemsSize)})` : ""}
							</Button>
						) : (
							<Button
								aria-label="Delete all history"
								className="w-full"
								disabled={deleteAllDisabled || (taskHistory.length === 0 && tasks.length === 0)}
								onClick={handleDeleteAllHistory}
								variant="danger">
								Delete All History{totalTasksSize !== null ? ` (${formatSize(totalTasksSize)})` : ""}
							</Button>
						)}
					</>
				)}
			</div>
		</div>
	)
}

// https://gist.github.com/evenfrost/1ba123656ded32fb7a0cd4651efd4db0
export const highlight = (fuseSearchResult: FuseResult<any>[], highlightClassName = "history-item-highlight") => {
	const set = (obj: Record<string, any>, path: string, value: any) => {
		const pathValue = path.split(".")
		let i: number

		for (i = 0; i < pathValue.length - 1; i++) {
			obj = obj[pathValue[i]] as Record<string, any>
		}

		obj[pathValue[i]] = value
	}

	// Function to merge overlapping regions
	const mergeRegions = (regions: [number, number][]): [number, number][] => {
		if (regions.length === 0) {
			return regions
		}

		// Sort regions by start index
		regions.sort((a, b) => a[0] - b[0])

		const merged: [number, number][] = [regions[0]]

		for (let i = 1; i < regions.length; i++) {
			const last = merged[merged.length - 1]
			const current = regions[i]

			if (current[0] <= last[1] + 1) {
				// Overlapping or adjacent regions
				last[1] = Math.max(last[1], current[1])
			} else {
				merged.push(current)
			}
		}

		return merged
	}

	const generateHighlightedText = (inputText: string, regions: [number, number][] = []) => {
		if (regions.length === 0) {
			return inputText
		}

		// Sort and merge overlapping regions
		const mergedRegions = mergeRegions(regions)

		let content = ""
		let nextUnhighlightedRegionStartingIndex = 0

		mergedRegions.forEach((region) => {
			const start = region[0]
			const end = region[1]
			const lastRegionNextIndex = end + 1

			content += [
				inputText.substring(nextUnhighlightedRegionStartingIndex, start),
				`<span class="${highlightClassName}">`,
				inputText.substring(start, lastRegionNextIndex),
				"</span>",
			].join("")

			nextUnhighlightedRegionStartingIndex = lastRegionNextIndex
		})

		content += inputText.substring(nextUnhighlightedRegionStartingIndex)

		return content
	}

	return fuseSearchResult
		.filter(({ matches }) => matches && matches.length)
		.map(({ item, matches }) => {
			const highlightedItem = { ...item }

			matches?.forEach((match) => {
				if (match.key && typeof match.value === "string" && match.indices) {
					// Merge overlapping regions before generating highlighted text
					const mergedIndices = mergeRegions([...match.indices])
					set(highlightedItem, match.key, generateHighlightedText(match.value, mergedIndices))
				}
			})

			return highlightedItem
		})
}

export default memo(HistoryView)
