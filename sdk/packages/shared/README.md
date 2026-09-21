# `@bedrock-coder/shared`

`@bedrock-coder/shared` owns dependency-light contracts and utilities shared by the
agent, Bedrock, and core runtime packages.

It includes:

- agent, message, tool, hook, and extension contracts
- session and workspace configuration primitives
- logging contracts
- chat runtime transport payloads
- Node storage-path helpers through `@bedrock-coder/shared/storage`

Inference transport contracts are Bedrock-only. Provider catalogs, provider
mutation actions, account actions, and generic credential fields are not part
of the shared RPC surface.

`formatErrorDiagnostics(error)` produces readable diagnostic text with messages, stack traces, nested causes, validation issues, and response values. It handles cyclic causes and bigint values, redacts credential fields, and excludes request bodies and request headers. `redactErrorDiagnostics(text)` redacts recognized credentials in existing text. Both helpers are available from the Node and browser entrypoints and preserve long diagnostic messages without truncation.
