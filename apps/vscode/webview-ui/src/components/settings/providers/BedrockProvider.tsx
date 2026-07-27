import { type ApiConfiguration, BEDROCK_DEFAULT_REGION } from "@shared/api"
import { type BedrockDoctorError, type BedrockTarget, bedrockTargetKey } from "@shared/bedrock-startup"
import { EmptyRequest } from "@shared/proto/bedrock_coder/common"
import { BedrockTargetSelectionRequest, UpdateBedrockCredentialsRequest } from "@shared/proto/bedrock_coder/models"
import type { Mode } from "@shared/storage/types"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useMemo, useState } from "react"
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

function TargetOption({ target, failed }: { target: BedrockTarget; failed: boolean }) {
	const targetType =
		target.kind === "inference-profile"
			? `${target.profileType === "APPLICATION" ? "Application" : "System-defined"} profile`
			: "Foundation model"
	const details = [targetType, target.providerName, target.baseModelId, target.streaming ? "streaming" : undefined]
		.filter(Boolean)
		.join(" · ")
	return (
		<option value={bedrockTargetKey(target)}>
			{target.displayName} — {target.invocationId}
			{details ? ` · ${details}` : ""}
			{failed ? " · test failed" : ""}
		</option>
	)
}

function ErrorDetails({ error }: { error: BedrockDoctorError }) {
	const metadata = [error.service, error.operation, error.awsCode, error.httpStatus, error.requestId]
		.filter((value) => value !== undefined)
		.join(" · ")
	return (
		<div className="text-xs text-error">
			<div>{error.message}</div>
			{metadata && <div>{metadata}</div>}
			{error.suggestion && <div>{error.suggestion}</div>}
		</div>
	)
}

const sectionClass = "rounded border border-solid border-(--vscode-panel-border) px-3 py-2"
const summaryClass = "cursor-pointer select-none"

export const BedrockProvider = ({ showModelOptions }: BedrockProviderProps) => {
	const { apiConfiguration, awsAccessKeysConfigured, bedrockStartup } = useExtensionState()
	const { handleFieldChange } = useApiConfigurationHandlers()
	const [now, setNow] = useState(Date.now())
	const [accessKeyId, setAccessKeyId] = useState("")
	const [secretAccessKey, setSecretAccessKey] = useState("")
	const [sessionToken, setSessionToken] = useState("")
	const [credentialExports, setCredentialExports] = useState("")
	const [credentialStatus, setCredentialStatus] = useState<string>()
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
			setCredentialStatus("Saved access keys removed.")
		} catch (error) {
			setCredentialStatus(error instanceof Error ? error.message : String(error))
		}
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
				<h3 className="m-0">AWS Bedrock startup</h3>
				<p className="text-description m-0 mt-1">
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
						initialValue={config.awsRegion || BEDROCK_DEFAULT_REGION}
						onChange={(value) => saveConnection("awsRegion", value)}
						placeholder={BEDROCK_DEFAULT_REGION}
						style={{ width: "100%" }}>
						AWS region
					</DebouncedTextField>

					<label className="flex flex-col gap-1">
						<span>AWS authentication</span>
						<select
							className="w-full bg-(--vscode-dropdown-background) text-(--vscode-dropdown-foreground) border border-solid border-(--vscode-dropdown-border) p-1"
							onChange={(event) =>
								saveConnection("awsAuthMode", event.target.value as "default" | "profile" | "access-key")
							}
							value={authMode}>
							<option value="default">Environment / IAM role</option>
							<option value="profile">AWS profile / SSO</option>
							<option value="access-key">Access keys</option>
						</select>
					</label>

					{authMode === "profile" && (
						<DebouncedTextField
							initialValue={config.awsProfile || ""}
							onChange={(value) => saveConnection("awsProfile", value || undefined)}
							placeholder="e.g. engineering-sso"
							style={{ width: "100%" }}>
							AWS profile
						</DebouncedTextField>
					)}

					{authMode === "default" && (
						<p className="text-xs text-description m-0">
							Uses environment variables, EC2/ECS credentials, or another source in the standard AWS credential
							chain.
						</p>
					)}

					{authMode === "access-key" && (
						<details className={sectionClass} open={!awsAccessKeysConfigured}>
							<summary className={summaryClass}>
								<strong>Access keys</strong>
								<span className="text-xs text-description">
									{" · "}
									{awsAccessKeysConfigured ? "saved" : "not configured"}
								</span>
							</summary>
							<div className="mt-3 flex flex-col gap-2">
								<label className="flex flex-col gap-1">
									<span>Paste AWS export credentials</span>
									<textarea
										autoCapitalize="none"
										autoCorrect="off"
										className="box-border w-full resize-y bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-solid border-(--vscode-input-border) p-2"
										onChange={(event) => setCredentialExports(event.target.value)}
										placeholder={
											"export AWS_ACCESS_KEY_ID=…\nexport AWS_SECRET_ACCESS_KEY=…\nexport AWS_SESSION_TOKEN=…"
										}
										rows={4}
										spellCheck={false}
										value={credentialExports}
									/>
								</label>
								<VSCodeButton disabled={!credentialExports.trim()} onClick={saveExportedAccessKeys}>
									Save pasted credentials
								</VSCodeButton>

								<details>
									<summary className={`${summaryClass} text-description`}>
										Enter the three fields individually
									</summary>
									<div className="mt-2 flex flex-col gap-2">
										<VSCodeTextField
											onInput={(event) => setAccessKeyId((event.target as HTMLInputElement).value)}
											placeholder="AKIA…"
											style={{ width: "100%" }}
											value={accessKeyId}>
											Access key ID
										</VSCodeTextField>
										<VSCodeTextField
											onInput={(event) => setSecretAccessKey((event.target as HTMLInputElement).value)}
											placeholder="Secret access key"
											style={{ width: "100%" }}
											type="password"
											value={secretAccessKey}>
											Secret access key
										</VSCodeTextField>
										<VSCodeTextField
											onInput={(event) => setSessionToken((event.target as HTMLInputElement).value)}
											placeholder="Required for temporary credentials"
											style={{ width: "100%" }}
											type="password"
											value={sessionToken}>
											Session token
										</VSCodeTextField>
										<VSCodeButton
											disabled={!accessKeyId.trim() || !secretAccessKey.trim()}
											onClick={saveAccessKeys}>
											Save access keys
										</VSCodeButton>
									</div>
								</details>

								{awsAccessKeysConfigured && (
									<VSCodeButton appearance="secondary" onClick={() => void clearAccessKeys()}>
										Remove saved keys
									</VSCodeButton>
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
						initialValue={config.awsBedrockEndpoint || ""}
						onChange={(value) => saveConnection("awsBedrockEndpoint", value || undefined)}
						placeholder="Optional Bedrock Runtime HTTPS endpoint"
						style={{ width: "100%" }}>
						Runtime endpoint (optional)
					</DebouncedTextField>
					<p className="text-xs text-description -mt-2 mb-0">
						This must be a Bedrock Runtime endpoint. Identity Center and SSO URLs are not valid here.
					</p>
					<DebouncedTextField
						initialValue={config.awsBedrockCaBundlePath || ""}
						onChange={(value) => saveConnection("awsBedrockCaBundlePath", value || undefined)}
						placeholder="Optional absolute or workspace-relative PEM path"
						style={{ width: "100%" }}>
						CA bundle path (optional)
					</DebouncedTextField>
				</div>
			</details>

			<details className={sectionClass}>
				<summary className={summaryClass}>
					<strong>Advanced control-plane endpoint</strong>
				</summary>
				<div className="mt-3">
					<DebouncedTextField
						initialValue={config.awsBedrockControlPlaneEndpoint || ""}
						onChange={(value) => saveConnection("awsBedrockControlPlaneEndpoint", value || undefined)}
						placeholder="Optional Bedrock control-plane HTTPS endpoint"
						style={{ width: "100%" }}>
						Control-plane endpoint (optional)
					</DebouncedTextField>
					<p className="text-xs text-description mt-1 mb-0">
						Do not reuse a Runtime, Identity Center, or SSO endpoint. Model discovery uses the separate Bedrock
						control-plane service.
					</p>
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
						<label className="flex flex-col gap-1">
							<span>Available model or inference profile</span>
							<select
								className="w-full bg-(--vscode-dropdown-background) text-(--vscode-dropdown-foreground) border border-solid border-(--vscode-dropdown-border) p-1"
								onChange={(event) => setPendingTargetKey(event.target.value)}
								value={pendingTargetKey}>
								<option disabled value="">
									Choose a destination
								</option>
								{foundationModels.length > 0 && (
									<optgroup label="Foundation models">
										{foundationModels.map((target) => (
											<TargetOption
												failed={Boolean(bedrockStartup?.probeFailures[bedrockTargetKey(target)])}
												key={bedrockTargetKey(target)}
												target={target}
											/>
										))}
									</optgroup>
								)}
								{inferenceProfiles.length > 0 && (
									<optgroup label="Inference profiles">
										{inferenceProfiles.map((target) => (
											<TargetOption
												failed={Boolean(bedrockStartup?.probeFailures[bedrockTargetKey(target)])}
												key={bedrockTargetKey(target)}
												target={target}
											/>
										))}
									</optgroup>
								)}
							</select>
						</label>
						<VSCodeButton disabled={!pendingTarget || bedrockStartup?.progress.cancellable} onClick={confirmTarget}>
							Confirm and test model
						</VSCodeButton>
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

				<div className="flex flex-wrap gap-2">
					<VSCodeButton
						appearance="secondary"
						onClick={() => void ModelsServiceClient.retryBedrockStartup(EmptyRequest.create())}>
						Retry
					</VSCodeButton>
					<VSCodeButton
						appearance="secondary"
						onClick={() => void ModelsServiceClient.refreshBedrockDiscovery(EmptyRequest.create())}>
						Refresh
					</VSCodeButton>
					{bedrockStartup?.progress.cancellable && (
						<VSCodeButton
							appearance="secondary"
							onClick={() => void ModelsServiceClient.cancelBedrockStartup(EmptyRequest.create())}>
							Cancel
						</VSCodeButton>
					)}
					<VSCodeButton
						appearance="secondary"
						onClick={() => void ModelsServiceClient.copyBedrockDiagnostics(EmptyRequest.create())}>
						Copy diagnostics
					</VSCodeButton>
					<VSCodeButton
						appearance="secondary"
						onClick={() => void ModelsServiceClient.openBedrockDiagnosticLog(EmptyRequest.create())}>
						Open log
					</VSCodeButton>
				</div>
			</div>

			<details className="text-xs text-description">
				<summary className={summaryClass}>Required IAM actions</summary>
				<p className="m-0 mt-1">
					bedrock:ListFoundationModels, bedrock:ListInferenceProfiles, bedrock:InvokeModel, and
					bedrock:InvokeModelWithResponseStream.
				</p>
			</details>
		</div>
	)
}
