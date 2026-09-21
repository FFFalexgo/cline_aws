# @bedrock-coder/llms

AWS Bedrock inference for BedrockCoder agents.

The runtime accepts a Bedrock model ID plus:

- an AWS region;
- an optional named AWS profile;
- an optional HTTPS Bedrock endpoint;
- an optional CA-bundle path.

Credentials come only from the AWS SDK credential-provider chain. The package
does not accept or persist API keys, access keys, secret keys, or session
tokens as configuration.

Failed model streams return a JSON string in the finish event's `error` field. It contains a readable `message`, available error `code`, HTTP `status`, AWS `request_id`, `providerId`, `modelId`, and redacted diagnostic text in `details`. Diagnostics preserve the original cause, validation issues, response values, and stack trace. The original provider error takes precedence over a later generic no-output error. Consumers can display the summary and offer the full details for inspection or copying.
