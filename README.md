<p align="center">
  <img src="apps/vscode/assets/icons/icon.png" width="160" alt="Bedrock Coder" />
</p>

<h1 align="center">Bedrock Coder</h1>

<p align="center">
  A local-first VS Code coding agent powered exclusively by Amazon Bedrock.
</p>

Bedrock Coder can inspect and edit a workspace, run terminal commands, browse
the web, use MCP servers, preserve checkpoints, and coordinate local agent
teams. File changes and commands remain subject to the approval policy you
choose in the extension.

## What makes this fork different

- Amazon Bedrock is the only model provider.
- AWS credentials can come from the standard AWS SDK credential chain, a named
  profile/SSO session, or access keys saved in the extension's restricted local
  secrets store. Access keys are not placed in ordinary settings. They are
  returned to the webview only when you explicitly click **Reveal saved
  credentials**.
- Settings, history, sessions, rules, hooks, skills, and plugins live under the
  independent `.bedrock-coder/` identity.
- The extension ID is `fffalexgo.bedrock-coder`, so it can be installed
  alongside official Cline without sharing commands or state.
- No hosted account, subscription, telemetry, or Marketplace publishing flow
  is required.

## Repository layout

| Area | Location |
|---|---|
| VS Code extension and webview | [`apps/vscode`](apps/vscode) |
| Runtime SDK packages | [`sdk/packages`](sdk/packages) |
| Implementation plans and results | [`plan`](plan) |

## Configure AWS Bedrock

Open the Bedrock Coder sidebar, expand **Connection**, and select one
authentication method:

- **Environment / IAM role** uses the standard AWS SDK credential chain.
- **AWS profile / SSO** uses a named profile that is already authenticated.
- **Access keys** saves credentials in Bedrock Coder's restricted local secrets
  store.

### Configure access keys

Prefer temporary credentials issued by your organization. Temporary
credentials contain all three of these values:

```sh
export AWS_ACCESS_KEY_ID="example-access-key-id"
export AWS_SECRET_ACCESS_KEY="example-secret-access-key"
export AWS_SESSION_TOKEN="example-session-token"
```

Copy the complete three-line block from AWS, paste it into **Paste AWS export
credentials**, and click **Save pasted credentials**. Lines may appear in any
order. Matching single or double quotes and trailing semicolons are removed
before the values are saved.

After saving:

1. The collapsed section should say **3 values saved, including session
   token**.
2. Click **Reveal saved credentials** to compare the exact stored values.
3. Use **Copy exports** to copy the stored values back in the same three-line
   format.
4. Click **Hide saved credentials** when finished.

The reveal operation happens only after an explicit click. Revealed values are
not added to extension state, diagnostics, or gRPC recorder logs. Replace the
credentials when the AWS session expires; temporary session tokens cannot be
refreshed automatically.

Do not use root-account access keys. Use the least-privileged IAM identity
available for your environment.

### Configure the region and Runtime endpoint

Set **Bedrock Runtime region** to the region where your organization has
enabled Bedrock, for example `us-east-1`. This region is used for both model
discovery and model invocation.

Normally, leave **Bedrock Runtime endpoint URL** blank. Bedrock Coder will use
the regional AWS endpoint automatically. If your working Python configuration
sets `BEDROCK_RUNTIME_ENDPOINT_URL`, enter the same value, for example:

```text
https://bedrock-runtime.us-east-1.amazonaws.com
```

The endpoint must be HTTPS and its region must match **Bedrock Runtime
region**. Identity Center, SSO, and ordinary AWS console URLs are not Bedrock
Runtime endpoints. Bedrock Coder does not require a separate user-configured
control-plane endpoint; model discovery uses AWS's regional Bedrock endpoint.

### Create `corp-ca-bundle.pem`

Leave **CA bundle path** blank when the machine can connect to AWS using its
normal system trust store. A custom bundle is needed only when a corporate
proxy or TLS-inspection service signs AWS connections with an internal
certificate authority.

The safest source is the PEM bundle supplied by your corporate IT/security
team. A CA bundle contains public root and intermediate certificates only. It
must never contain a private key.

If the certificate is already trusted on macOS:

1. Open **Keychain Access**.
2. Find the corporate root or intermediate CA under **System** or **login**.
3. Export it as a certificate, not as a private key or identity.
4. Convert a DER-encoded `.cer` file to PEM when necessary:

   ```sh
   openssl x509 -inform DER -in corporate-root.cer -out corporate-root.pem
   ```

5. Put the root and intermediates into one file, with the issuing root last:

   ```sh
   cat corporate-intermediate.pem corporate-root.pem > corp-ca-bundle.pem
   ```

To export a named public certificate directly from a macOS keychain:

```sh
security find-certificate -c "Corporate Root CA" -p \
  /Library/Keychains/System.keychain > corp-ca-bundle.pem
```

Replace `Corporate Root CA` with the certificate's exact Keychain name. If it
is stored in the login keychain, use
`~/Library/Keychains/login.keychain-db` instead.

On Windows, open `certmgr.msc`, locate the corporate CA under **Trusted Root
Certification Authorities** or **Intermediate Certification Authorities**,
and export it using **Base-64 encoded X.509 (.CER)**. A Base-64 export already
contains the required `BEGIN CERTIFICATE` and `END CERTIFICATE` markers. Append
the intermediate and root certificate blocks to `corp-ca-bundle.pem`.

Verify that the bundle is readable:

```sh
openssl crl2pkcs7 -nocrl -certfile corp-ca-bundle.pem \
  | openssl pkcs7 -print_certs -noout
```

Then enter the absolute path in **CA bundle path**, for example:

```text
/Users/your-name/certificates/corp-ca-bundle.pem
```

If the Python implementation already works with `AWS_CA_BUNDLE`, use that same
file path. Do not copy certificate text, access keys, or session tokens into
chat or diagnostics.

### Validate the connection

Click **Refresh** after changing credentials, region, endpoint, or CA bundle.
A successful catalog request displays **Connection established** and an
available model/profile dropdown. Select a destination and click **Confirm and
test model** before opening chat.

The IAM identity needs these Bedrock actions:

```text
bedrock:ListFoundationModels
bedrock:ListInferenceProfiles
bedrock:InvokeModel
bedrock:InvokeModelWithResponseStream
```

Startup also calls STS `GetCallerIdentity`.

## Development

Requirements: Bun 1.3.13 and Node.js 22 or newer.

```powershell
bun install
bun run build:sdk
cd apps/vscode
bun run check-types
bun run package
```

The extension's AWS permissions and startup behavior are documented in
[`apps/vscode/README.md`](apps/vscode/README.md).

## Local data

The default home is `~/.bedrock-coder/`. Override it with
`BEDROCK_CODER_DIR`; narrower data and settings paths use the
`BEDROCK_CODER_` environment prefix. Workspace instructions use
`.bedrock-coder/`.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report defects through
[GitHub Issues](https://github.com/FFFalexgo/AWS_Bedrock_Coder/issues); report
security vulnerabilities privately through the repository's GitHub Security
Advisories.

## License and attribution

Bedrock Coder is licensed under Apache-2.0. It is an independently maintained
derivative of [Cline](https://github.com/cline/cline) and is not affiliated
with, sponsored by, or endorsed by Cline Bot Inc. or Amazon Web Services. See
[NOTICE](NOTICE), [MODIFICATIONS.md](MODIFICATIONS.md), and [LICENSE](LICENSE).
