# Bedrock Coder for VS Code

Bedrock Coder is a local-first coding agent powered exclusively by Amazon
Bedrock.

## AWS Bedrock startup

The VS Code extension validates its AWS connection on activation, discovers
streaming text foundation models and inference profiles from the regional
Bedrock control plane, and probes only the selected destination through the
same streaming runtime used by chat.

Choose one authentication source in **Settings → AWS Bedrock startup**:

- **Environment / IAM role** uses the AWS SDK default credential chain.
- **AWS profile / SSO** uses the selected named profile.
- **Access keys** accepts an access key ID, secret access key, and optional
  session token. You can enter the fields separately or paste the standard
  three-line `export AWS_...=...` block copied from AWS and save it in one
  action. These values are write-only from the webview and are saved in the
  restricted local secrets store at
  `~/.bedrock-coder/data/secrets.json`, not in ordinary settings, diagnostics,
  or session records.

Prefer temporary credentials with a session token where possible. Use
**Remove saved keys** before disposing of a machine or switching identities.

The Runtime endpoint and advanced control-plane endpoint are separate
settings; a Runtime or VPC endpoint is not inferred as a control-plane
endpoint. A configured CA bundle is applied to credential-provider calls, STS,
Bedrock discovery, and Bedrock Runtime.

The AWS identity needs permission for:

```text
bedrock:ListFoundationModels
bedrock:ListInferenceProfiles
bedrock:InvokeModel
bedrock:InvokeModelWithResponseStream
```

STS `GetCallerIdentity` is also called during startup to distinguish invalid or
expired credentials from Bedrock authorization failures. Only a masked account
identifier may be displayed for the current extension session.
