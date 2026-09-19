import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseFilePath } from "@shared/file-path"
import { findWorkspacePath } from "./workspace-file-path"

describe("chat workspace paths", () => {
	let directory: string
	let first: string
	let second: string
	beforeAll(async () => {
		directory = await mkdtemp(path.join(os.tmpdir(), "bedrock-path-links-"))
		first = path.join(directory, "frontend")
		second = path.join(directory, "backend")
		await mkdir(path.join(first, "src"), { recursive: true })
		await mkdir(path.join(second, "src"), { recursive: true })
		await writeFile(path.join(first, "src", "main.ts"), "")
		await writeFile(path.join(second, "src", "main.ts"), "")
		await writeFile(path.join(second, "src", "space name.ts"), "")
		await writeFile(path.join(directory, "outside.txt"), "")
	})
	afterAll(async () => {
		if (
			path.dirname(directory) !== path.resolve(os.tmpdir()) ||
			!path.basename(directory).startsWith("bedrock-path-links-")
		) {
			throw new Error("Unexpected test directory")
		}
		await rm(directory, { recursive: true, force: true })
	})

	it("resolves files, directories, backslashes, and line references", async () => {
		for (const reference of ["src/main.ts", "src\\main.ts", "./src/main.ts:12:4", "src/main.ts#L12-L15"]) {
			expect(await findWorkspacePath(reference, [first])).toBe(path.join(first, "src", "main.ts"))
		}
		expect(await findWorkspacePath("src/", [first])).toBe(path.join(first, "src"))
	})

	it("uses the active root, other roots, and root-qualified references", async () => {
		expect(await findWorkspacePath("src/main.ts", [first, second], second)).toBe(path.join(second, "src", "main.ts"))
		expect(await findWorkspacePath("backend/src/main.ts", [first, second])).toBe(path.join(second, "src", "main.ts"))
		expect(await findWorkspacePath("src/space name.ts", [first, second])).toBe(path.join(second, "src", "space name.ts"))
	})

	it("accepts absolute paths and local file URLs with spaces", async () => {
		const file = path.join(second, "src", "space name.ts")
		expect(await findWorkspacePath(file, [first, second])).toBe(file)
		expect(await findWorkspacePath(pathToFileURL(file).href, [first, second])).toBe(file)
	})

	it("leaves missing files, paths outside the workspace, and empty workspaces unresolved", async () => {
		for (const reference of ["missing.ts", "../outside.txt", path.join(directory, "outside.txt"), ""]) {
			expect(await findWorkspacePath(reference, [first])).toBeUndefined()
		}
		expect(await findWorkspacePath(path.join(first, "src/main.ts"), [])).toBeUndefined()
	})

	it("recognizes Windows drive paths without treating executable or remote URIs as paths", () => {
		expect(parseFilePath("C:\\Project Files\\src\\main.ts:12:4")).toBe("C:\\Project Files\\src\\main.ts")
		expect(parseFilePath("file:///C:/Project%20Files/main.ts#L12")).toBe("C:/Project Files/main.ts")
		for (const reference of [
			"https://example.com/a.ts",
			"command:workbench.action.closeWindow",
			"javascript:alert(1)",
			"#intro",
			"file://server/share/a.ts",
			"\\\\server\\share",
			"bad\npath.ts",
		]) {
			expect(parseFilePath(reference)).toBeUndefined()
		}
	})
})
