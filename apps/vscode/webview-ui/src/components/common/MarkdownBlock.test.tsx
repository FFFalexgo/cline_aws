import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { resolvePath, revealPathInExplorer } = vi.hoisted(() => ({ resolvePath: vi.fn(), revealPathInExplorer: vi.fn() }))
vi.mock("@/services/grpc-client", () => ({ FileServiceClient: { resolvePath, revealPathInExplorer }, StateServiceClient: {} }))
vi.mock("./MermaidBlock", () => ({ default: () => null }))
vi.mock("./CopyButton", () => ({ WithCopyButton: ({ children }: { children: React.ReactNode }) => children }))

import MarkdownBlock from "./MarkdownBlock"
import { WorkspacePathLink } from "./WorkspacePathLink"

describe("chat path references", () => {
	beforeEach(() => {
		resolvePath
			.mockReset()
			.mockImplementation(async ({ value }) => ({ value: value.includes("missing") ? "" : `resolved/${value}` }))
		revealPathInExplorer.mockReset().mockResolvedValue({})
	})
	afterEach(cleanup)

	it.each([
		"src/main.ts",
		"src/",
		"C:\\Project Files\\main.ts",
		"/workspace/src/main.ts:12:4",
	])("reveals inline path %s in Explorer", async (reference) => {
		render(<MarkdownBlock markdown={`Open \`${reference}\`.`} />)
		fireEvent.click(await screen.findByRole("button", { name: reference }))
		expect(revealPathInExplorer).toHaveBeenCalledWith({ value: `resolved/${reference}` })
	})

	it("links bare paths without swallowing punctuation", async () => {
		render(<MarkdownBlock markdown="See src/main.ts:12, then src/components/." />)
		expect(await screen.findByRole("button", { name: "src/main.ts:12" })).toBeVisible()
		expect(await screen.findByRole("button", { name: "src/components/" })).toBeVisible()
		expect(screen.getByText(/, then/)).toBeVisible()
	})

	it("handles labeled local Markdown links without nested buttons", async () => {
		render(<MarkdownBlock markdown="[Main file](src/main.ts) and [`src/`](src/)" />)
		fireEvent.click(await screen.findByRole("button", { name: "Main file" }))
		expect(revealPathInExplorer).toHaveBeenCalledWith({ value: "resolved/src/main.ts" })
		expect(await screen.findByRole("button", { name: "src/" })).toBeVisible()
		expect(screen.getAllByRole("button")).toHaveLength(2)
	})

	it("decodes Markdown path URLs and preserves bare Windows paths", async () => {
		render(<MarkdownBlock markdown={"[Spaced file](src/space%20name.ts) and C:\\project\\main.ts"} />)
		fireEvent.click(await screen.findByRole("button", { name: "Spaced file" }))
		expect(revealPathInExplorer).toHaveBeenCalledWith({ value: "resolved/src/space name.ts" })
		fireEvent.click(await screen.findByRole("button", { name: "C:\\project\\main.ts" }))
		expect(revealPathInExplorer).toHaveBeenCalledWith({ value: "resolved/C:\\project\\main.ts" })
	})

	it("keeps web links, anchors, and fenced code intact", () => {
		render(<MarkdownBlock markdown={"[Docs](https://example.com/docs) [Section](#intro)\n\n```text\nsrc/main.ts\n```"} />)
		expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://example.com/docs")
		expect(screen.getByRole("link", { name: "Section" })).toHaveAttribute("href", "#intro")
		expect(resolvePath).not.toHaveBeenCalled()
	})

	it("keeps missing paths as readable text", async () => {
		render(<MarkdownBlock markdown="`src/missing.ts`" />)
		await waitFor(() => expect(resolvePath).toHaveBeenCalled())
		expect(screen.getByText("src/missing.ts")).toBeVisible()
		expect(screen.queryByRole("button")).toBeNull()
	})

	it("preserves the full response when paths resolve while the response streams", async () => {
		const path = "/Users/cchen96/BMODev/AgentFlow/benchmark/graph/paystub/package/graph.json"
		const { rerender, container } = render(<MarkdownBlock markdown={`I checked \`${path}\`. The field is missing.`} />)
		await screen.findByRole("button", { name: path })
		rerender(
			<MarkdownBlock
				markdown={`I checked \`${path}\`. The field is missing.\n\nUpdate the mapping in benchmark/README.md.\n\n- Keep the existing evaluation.\n- Run it again after the fix.\n\nThe remaining results are valid.`}
			/>,
		)
		await screen.findByRole("button", { name: "benchmark/README.md" })

		expect(container).toHaveTextContent("The field is missing.")
		expect(container).toHaveTextContent("Update the mapping in benchmark/README.md.")
		expect(screen.getAllByRole("listitem")).toHaveLength(2)
		expect(screen.getByText("The remaining results are valid.")).toBeVisible()
	})

	it("does not reuse a resolved target when a streaming reference changes", async () => {
		const { rerender } = render(<WorkspacePathLink reference="first.ts">first.ts</WorkspacePathLink>)
		await screen.findByRole("button", { name: "first.ts" })
		resolvePath.mockReturnValue(new Promise(() => {}))
		rerender(<WorkspacePathLink reference="second.ts">second.ts</WorkspacePathLink>)
		expect(screen.queryByRole("button")).toBeNull()
	})

	it("preserves all prose when path lookup fails and a stale result arrives after a newer response", async () => {
		let resolveOld: (value: { value: string }) => void = () => {}
		resolvePath.mockImplementation(({ value }) =>
			value === "old.ts"
				? new Promise((resolve) => {
						resolveOld = resolve
					})
				: Promise.reject(new Error("Path lookup unavailable")),
		)
		const { rerender, container } = render(<MarkdownBlock markdown="Before `old.ts` and after the link." />)
		rerender(<MarkdownBlock markdown="New response with `new.ts`, plus the complete explanation.\n\nFINAL_TEXT" />)
		resolveOld({ value: "old.ts" })
		await waitFor(() => expect(resolvePath).toHaveBeenCalledWith({ value: "new.ts" }))
		expect(container).toHaveTextContent("New response with new.ts, plus the complete explanation.")
		expect(container).toHaveTextContent("FINAL_TEXT")
		expect(screen.queryByRole("button")).toBeNull()
	})
})
