import { type ApiConfiguration, BEDROCK_DEFAULT_REGION } from "@shared/api"
import { type BedrockDoctorError, type BedrockTarget, bedrockTargetKey } from "@shared/bedrock-startup"
import { EmptyRequest } from "@shared/proto/bedrock_coder/common"
import { BedrockTargetSelectionRequest, UpdateBedrockCredentialsRequest } from "@shared/proto/bedrock_coder/models"
import type { Mode } from "@shared/storage/types"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelsServiceClient } from "@/services/grpc-client"
import { parseAwsCredentialExports } from "@/utils/awsCredentialExport"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

interface BedrockProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

interface RevealedCredentials {
	accessKeyId: string
	secretAccessKey: string
	sessionToken: string
}

function quotedExportValue(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`
}

function credentialExportBlock(credentials: RevealedCredentials): string {
	return [
		`export AWS_ACCESS_KEY_ID=${quotedExportValue(credentials.accessKeyId)}`,
		`export AWS_SECRET_ACCESS_KEY=${quotedExportValue(credentials.secretAccessKey)}`,
		`export AWS_SESSION_TOKEN=${quotedExportValue(credentials.sessionToken)}`,
	].join("\n")
}

function TargetOption({ target, failed }: { target: BedrockTarget; failed: boolean }) {
	const targetType =
		target.kind === "inference-profile"
			? `${target.profileType === "APPLICATION" ? "Application" : "System-defined"} profile`
			: "Foundation model"
	const details = [targetType, target.providerName, target.baseModelId, target.streaming ? "streaming" : undefined]
		.filter(Boolean)
		.join(" · ")
	return (
		<SelectItem textValue={target.displayName} value={bedrockTargetKey(target)}>
			{target.displayName} — {target.invocationId}
			{details ? ` · ${details}` : ""}
			{failed ? " · test failed" : ""}
		</SelectItem>
	)
}

function ErrorDetails({ error }: { error: BedrockDoctorError }) {
	const metadata = [error.service, error.operation, error.awsCode, error.httpStatus, error.requestId]
		.filter((value) => value !== undefined)
		.join(" · ")
	return (
		<div className="text-sm leading-normal break-words text-error">
			<div>{error.message}</div>
			{metadata && <div>{metadata}</div>}
			{error.suggestion && <div>{error.suggestion}</div>}
		</div>
	)
}

const sectionClass = "rounded-xs border border-solid border-border-panel px-2.5 py-2"
const summaryClass = "cursor-pointer select-none"

export const BedrockProvider = ({ showModelOptions }: BedrockProviderProps) => {
	const { apiConfiguration, awsAccessKeysConfigured, awsSessionTokenConfigured, bedrockStartup } = useExtensionState()
	const { handleFieldChange } = useApiConfigurationHandlers()
	const [now, setNow] = useState(Date.now())
	const [accessKeyId, setAccessKeyId] = useState("")
	const [secretAccessKey, setSecretAccessKey] = useState("")
	const [sessionToken, setSessionToken] = useState("")
	const [credentialExports, setCredentialExports] = useState("")
	const [credentialStatus, setCredentialStatus] = useState<string>()
	const [revealedCredentials, setRevealedCredentials] = useState<RevealedCredentials>()
	const [pendingTargetKey, setPendingTargetKey] = useState("")
	const config = apiConfiguration ?? {}
	const authMode = config.awsAuthMode ?? (config.awsProfile ? "profile" : "default")

	useEffect(() => {
		if (!bedrockStartup?.progress.cancellable) return
		const timer = window.setInterval(() => setNow(Date.now()), 1_000)
		return () => window.clearInterval(timer)
	}, [bedrockStartup?.progress.cancellable])

	useEffect(() => {
		setPendingTargetKey((current) => {
			if (bedrockStartup?.targets.some((target) => bedrockTargetKey(target) === current)) return current
			return bedrockStartup?.selectedTarget ? bedrockTargetKey(bedrockStartup.selectedTarget) : ""
		})
	}, [bedrockStartup?.selectedTarget, bedrockStartup?.targets])

	const saveConnection = <K extends keyof ApiConfiguration>(field: K, value: ApiConfiguration[K]) => {
		void handleFieldChange(field, value)
	}
	const saveCredentialValues = async (credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }) => {
		setCredentialStatus("Saving access keys…")
		try {
			await ModelsServiceClient.updateBedrockCredentials(
				UpdateBedrockCredentialsRequest.create({
					accessKeyId: credentials.accessKeyId,
					secretAccessKey: credentials.secretAccessKey,
					sessionToken: credentials.sessionToken ?? "",
				}),
			)
			setRevealedCredentials({
				accessKeyId: credentials.accessKeyId,
				secretAccessKey: credentials.secretAccessKey,
				sessionToken: credentials.sessionToken ?? "",
			})
			setAccessKeyId("")
			setSecretAccessKey("")
			setSessionToken("")
			setCredentialExports("")
			setCredentialStatus("Access keys saved. Bedrock validation is restarting.")
		} catch (error) {
			setCredentialStatus(error instanceof Error ? error.message : String(error))
		}
	}
	const saveAccessKeys = () => {
		void saveCredentialValues({ accessKeyId, secretAccessKey, sessionToken })
	}
	const saveExportedAccessKeys = () => {
		try {
			void saveCredentialValues(parseAwsCredentialExports(credentialExports))
		} catch (error) {
			setCredentialStatus(error instanceof Error ? error.message : String(error))
		}
	}
	const clearAccessKeys = async () => {
		setCredentialStatus("Removing access keys…")
		try {
			await ModelsServiceClient.updateBedrockCredentials(
				UpdateBedrockCredentialsRequest.create({
					accessKeyId: "",
					secretAccessKey: "",
					sessionToken: "",
					clear: true,
				}),
			)
			setAccessKeyId("")
			setSecretAccessKey("")
			setSessionToken("")
			setRevealedCredentials(undefined)
			setCredentialStatus("Saved access keys removed.")
		} catch (error) {
			setCredentialStatus(error instanceof Error ? error.message : String(error))
		}
	}
	const revealSavedCredentials = async () => {
		setCredentialStatus("Loading saved credentials…")
		try {
			const credentials = await ModelsServiceClient.revealBedrockCredentials(EmptyRequest.create())
			if (!credentials.accessKeyId || !credentials.secretAccessKey) {
				setRevealedCredentials(undefined)
				setCredentialStatus("No complete access-key pair is saved.")
				return
			}
			setRevealedCredentials({
				accessKeyId: credentials.accessKeyId,
				secretAccessKey: credentials.secretAccessKey,
				sessionToken: credentials.sessionToken,
			})
			setCredentialStatus("Saved credentials revealed below.")
		} catch (error) {
			setCredentialStatus(error instanceof Error ? error.message : String(error))
		}
	}
	const copyRevealedCredentials = async () => {
		if (!revealedCredentials) return
		await navigator.clipboard.writeText(credentialExportBlock(revealedCredentials))
		setCredentialStatus("Saved credentials copied as three export lines.")
	}

	const foundationModels = useMemo(
		() => bedrockStartup?.targets.filter((target) => target.kind === "foundation-model") ?? [],
		[bedrockStartup?.targets],
	)
	const inferenceProfiles = useMemo(
		() => bedrockStartup?.targets.filter((target) => target.kind === "inference-profile") ?? [],
		[bedrockStartup?.targets],
	)
	const pendingTarget = bedrockStartup?.targets.find((target) => bedrockTargetKey(target) === pendingTargetKey)
	const elapsedSeconds = bedrockStartup ? Math.max(0, Math.floor((now - bedrockStartup.progress.startedAt) / 1_000)) : 0
	const catalogWarnings = bedrockStartup?.catalogWarnings ?? []
	const primaryErrorIsCatalogWarning =
		Boolean(bedrockStartup?.error) &&
		catalogWarnings.some(
			(warning) => warning.stage === bedrockStartup?.error?.stage && warning.operation === bedrockStartup?.error?.operation,
		)

	const confirmTarget = () => {
		if (!pendingTarget) return
		void ModelsServiceClient.selectBedrockTarget(
			BedrockTargetSelectionRequest.create({
				kind: pendingTarget.kind,
				invocationId: pendingTarget.invocationId,
			}),
		)
	}

	return (
		<div className="flex flex-col gap-3">
			<div>
				<h3 className="m-0">AWS Bedrock</h3>
				<p className="text-sm text-description m-0 mt-1">
					Validate the connection, choose a discovered model or profile, then confirm it before opening chat.
				</p>
			</div>

			<details className={sectionClass} open>
				<summary className={summaryClass}>
					<strong>Connection</strong>
					<span className="text-xs text-description">
						{" "}
						· {config.awsRegion || BEDROCK_DEFAULT_REGION} · {authMode}
					</span>
				</summary>
				<div className="mt-3 flex flex-col gap-3">
					<DebouncedTextField
						description="Used for regional model discovery and Bedrock Runtime."
						initialValue={config.awsRegion || BEDROCK_DEFAULT_REGION}
						onChange={(value) => saveConnection("awsRegion", value)}
						placeholder={BEDROCK_DEFAULT_REGION}
						style={{ width: "100%" }}>
						Bedrock Runtime region
					</DebouncedTextField>

					<Field>
						<FieldLabel htmlFor="aws-auth-mode">AWS authentication</FieldLabel>
						<Select
							onValueChange={(value) =>
								saveConnection("awsAuthMode", value as "default" | "profile" | "access-key")
							}
							value={authMode}>
							<SelectTrigger className="w-full" id="aws-auth-mode">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="default">Environment / IAM role</SelectItem>
									<SelectItem value="profile">AWS profile / SSO</SelectItem>
									<SelectItem value="access-key">Access keys</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
						{authMode === "default" && (
							<FieldDescription>
								Uses environment variables, EC2/ECS credentials, or another source in the standard AWS credential
								chain.
							</FieldDescription>
						)}
					</Field>

					{authMode === "profile" && (
						<DebouncedTextField
							initialValue={config.awsProfile || ""}
							onChange={(value) => saveConnection("awsProfile", value || undefined)}
							placeholder="e.g. engineering-sso"
							style={{ width: "100%" }}>
							AWS profile
						</DebouncedTextField>
					)}

					{authMode === "access-key" && (
						<details className={sectionClass} open={!awsAccessKeysConfigured}>
							<summary className={summaryClass}>
								<strong>Access keys</strong>
								<span className="text-xs text-description">
									{" · "}
									{awsAccessKeysConfigured
										? awsSessionTokenConfigured
											? "3 values saved, including session token"
											: "2 values saved, no session token"
										: "not configured"}
								</span>
							</summary>
							<div className="mt-3 flex flex-col gap-2">
								<label className="flex flex-col gap-1">
									<span>Paste AWS export credentials</span>
									<textarea
										autoCapitalize="none"
										autoCorrect="off"
										className="rounded-xs leading-normal box-border w-full resize-y bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-solid border-(--vscode-input-border) p-2"
										onChange={(event) => setCredentialExports(event.target.value)}
										placeholder={
											"export AWS_ACCESS_KEY_ID=…\nexport AWS_SECRET_ACCESS_KEY=…\nexport AWS_SESSION_TOKEN=…"
										}
										rows={4}
										spellCheck={false}
										value={credentialExports}
									/>
								</label>
								<Button disabled={!credentialExports.trim()} onClick={saveExportedAccessKeys} size="sm">
									Save pasted credentials
								</Button>

								{awsAccessKeysConfigured && (
									<div className="flex flex-col gap-2">
										<div className="flex flex-wrap gap-2">
											<Button
												onClick={() =>
													revealedCredentials
														? setRevealedCredentials(undefined)
														: void revealSavedCredentials()
												}
												size="sm"
												variant="secondary">
												{revealedCredentials ? "Hide saved credentials" : "Reveal saved credentials"}
											</Button>
											{revealedCredentials && (
												<Button
													onClick={() => void copyRevealedCredentials()}
													size="sm"
													variant="secondary">
													Copy exports
												</Button>
											)}
										</div>
										{revealedCredentials && (
											<textarea
												className="rounded-xs leading-normal box-border w-full resize-y bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-solid border-(--vscode-input-border) p-2 font-mono text-xs"
												readOnly
												rows={4}
												spellCheck={false}
												value={credentialExportBlock(revealedCredentials)}
											/>
										)}
									</div>
								)}

								<details>
									<summary className={`${summaryClass} text-description`}>
										Enter the three fields individually
									</summary>
									<div className="mt-2 flex flex-col gap-2">
										<Field>
											<FieldLabel htmlFor="access-key-id">Access key ID</FieldLabel>
											<Input
												id="access-key-id"
												onChange={(event) => setAccessKeyId(event.target.value)}
												placeholder="AKIA…"
												value={accessKeyId}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="secret-access-key">Secret access key</FieldLabel>
											<Input
												id="secret-access-key"
												onChange={(event) => setSecretAccessKey(event.target.value)}
												placeholder="Secret access key"
												type="password"
												value={secretAccessKey}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="session-token">Session token</FieldLabel>
											<Input
												id="session-token"
												onChange={(event) => setSessionToken(event.target.value)}
												placeholder="Required for temporary credentials"
												type="password"
												value={sessionToken}
											/>
										</Field>
										<Button
											disabled={!accessKeyId.trim() || !secretAccessKey.trim()}
											onClick={saveAccessKeys}
											size="sm">
											Save access keys
										</Button>
									</div>
								</details>

								{awsAccessKeysConfigured && (
									<Button onClick={() => void clearAccessKeys()} size="sm" variant="secondary">
										Remove saved keys
									</Button>
								)}
								{credentialStatus && <p className="text-xs text-description m-0">{credentialStatus}</p>}
								<p className="text-xs text-description m-0">
									Temporary credentials require all three values. Credentials stay in the extension host secret
									store.
								</p>
							</div>
						</details>
					)}
				</div>
			</details>

			<details className={sectionClass}>
				<summary className={summaryClass}>
					<strong>Network and certificates</strong>
					<span className="text-xs text-description">
						{" · "}
						{config.awsBedrockEndpoint || config.awsBedrockCaBundlePath ? "customized" : "AWS defaults"}
					</span>
				</summary>
				<div className="mt-3 flex flex-col gap-3">
					<DebouncedTextField
						description="Leave blank to use the regional AWS default. A custom endpoint must match the Runtime region above."
						initialValue={config.awsBedrockEndpoint || ""}
						onChange={(value) => saveConnection("awsBedrockEndpoint", value || undefined)}
						placeholder="Optional Bedrock Runtime HTTPS endpoint"
						style={{ width: "100%" }}>
						Bedrock Runtime endpoint URL (optional)
					</DebouncedTextField>
					<DebouncedTextField
						initialValue={config.awsBedrockCaBundlePath || ""}
						onChange={(value) => saveConnection("awsBedrockCaBundlePath", value || undefined)}
						placeholder="Optional absolute or workspace-relative PEM path"
						style={{ width: "100%" }}>
						CA bundle path (optional)
					</DebouncedTextField>
				</div>
			</details>

			<div className={`${sectionClass} flex flex-col gap-2`}>
				<div className="flex justify-between gap-2">
					<strong>
						{bedrockStartup?.connectionVerified
							? "✓ Connection established"
							: (bedrockStartup?.progress.label ?? "Starting Bedrock validation")}
					</strong>
					<span className="text-description">{elapsedSeconds}s</span>
				</div>
				{bedrockStartup && (
					<div className="text-xs text-description">
						{bedrockStartup.connectionSummary.region} · {bedrockStartup.connectionSummary.profile}
						{bedrockStartup.maskedAccountId ? ` · account ${bedrockStartup.maskedAccountId}` : ""}
						{bedrockStartup.discoveryFromCache ? " · session cache" : ""}
					</div>
				)}

				{catalogWarnings.length > 0 && (
					<details open={!bedrockStartup?.connectionVerified}>
						<summary className={`${summaryClass} text-xs text-error`}>
							{catalogWarnings.length} catalog operation{catalogWarnings.length === 1 ? "" : "s"} failed
						</summary>
						<div className="mt-2 flex flex-col gap-2">
							{catalogWarnings.map((warning) => (
								<ErrorDetails
									error={warning}
									key={`${warning.stage}:${warning.operation}:${warning.requestId ?? warning.awsCode ?? "error"}`}
								/>
							))}
						</div>
					</details>
				)}

				{showModelOptions && (foundationModels.length > 0 || inferenceProfiles.length > 0) && (
					<>
						<Field>
							<FieldLabel htmlFor="bedrock-model">Available model or inference profile</FieldLabel>
							<Select onValueChange={setPendingTargetKey} value={pendingTargetKey}>
								<SelectTrigger className="w-full" id="bedrock-model">
									<SelectValue placeholder="Choose a destination">{pendingTarget?.displayName}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{foundationModels.length > 0 && (
										<SelectGroup>
											<SelectLabel>Foundation models</SelectLabel>
											{foundationModels.map((target) => (
												<TargetOption
													failed={Boolean(bedrockStartup?.probeFailures[bedrockTargetKey(target)])}
													key={bedrockTargetKey(target)}
													target={target}
												/>
											))}
										</SelectGroup>
									)}
									{inferenceProfiles.length > 0 && (
										<SelectGroup>
											<SelectLabel>Inference profiles</SelectLabel>
											{inferenceProfiles.map((target) => (
												<TargetOption
													failed={Boolean(bedrockStartup?.probeFailures[bedrockTargetKey(target)])}
													key={bedrockTargetKey(target)}
													target={target}
												/>
											))}
										</SelectGroup>
									)}
								</SelectContent>
							</Select>
						</Field>
						<Button
							disabled={!pendingTarget || bedrockStartup?.progress.cancellable}
							onClick={confirmTarget}
							size="sm">
							Confirm and test model
						</Button>
						<p className="text-xs text-description m-0">
							Confirmation runs one small streaming compatibility test and may incur a very small Bedrock charge.
						</p>
					</>
				)}

				{bedrockStartup?.phase === "ready" && bedrockStartup.selectedTarget && (
					<div className="text-xs">
						<div>✓ Model confirmed — chat is ready.</div>
						<code className="break-all">{bedrockStartup.selectedTarget.invocationId}</code>
					</div>
				)}

				{bedrockStartup?.notice && <p className="text-xs text-description m-0">{bedrockStartup.notice}</p>}
				{bedrockStartup?.error && !primaryErrorIsCatalogWarning && <ErrorDetails error={bedrockStartup.error} />}

				<div
					aria-label="Connection actions"
					className="flex items-center gap-1 overflow-x-auto py-0.5 [&>button]:shrink-0"
					role="group">
					<Button
						onClick={() => void ModelsServiceClient.retryBedrockStartup(EmptyRequest.create())}
						size="xs"
						variant="ghost">
						Retry
					</Button>
					<Button
						onClick={() => void ModelsServiceClient.refreshBedrockDiscovery(EmptyRequest.create())}
						size="xs"
						variant="ghost">
						Refresh
					</Button>
					{bedrockStartup?.progress.cancellable && (
						<Button
							onClick={() => void ModelsServiceClient.cancelBedrockStartup(EmptyRequest.create())}
							size="xs"
							variant="ghost">
							Cancel
						</Button>
					)}
					<Button
						onClick={() => void ModelsServiceClient.copyBedrockDiagnostics(EmptyRequest.create())}
						size="xs"
						variant="ghost">
						Copy diagnostics
					</Button>
					<Button
						onClick={() => void ModelsServiceClient.openBedrockDiagnosticLog(EmptyRequest.create())}
						size="xs"
						variant="ghost">
						Open log
					</Button>
				</div>
			</div>
		</div>
	)
}
