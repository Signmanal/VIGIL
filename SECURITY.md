# Security Policy

## Local State

VIGIL stores local runtime state under `VIGIL_HOME`.

- macOS/Linux default: `~/.vigil`
- Windows default: `%LOCALAPPDATA%\vigil`
- Override: `VIGIL_HOME=/path/to/state`

VIGIL does not automatically migrate or read VIGIL state unless a future,
explicit migration command is implemented.

## Dashboard Bind Address

The dashboard defaults to `127.0.0.1:9779`. Localhost binding is the safe
default because dashboard sessions may expose configuration, local files,
logs, tool output, and credential-management flows.

Do not bind the dashboard to a non-loopback interface unless you also provide
network isolation, firewalling, and authentication appropriate for that host.

## Credential Handling

Credentials belong in local config, local environment, OS keychains, or provider
OAuth flows. Do not commit real tokens, API keys, private keys, webhook secrets,
or exported session data to this repository.

Required scans before push:

- `gitleaks detect --source .`
- `scripts/secret_scan.sh`

Known fixture/example allowlists are documented in `.gitleaks.toml`; do not
add broad path allowlists for production code.

## Tool Execution Boundary

VIGIL can run shell, file, browser, MCP, and provider tools through the local
agent runtime. Treat tool execution as local code execution with the same
permissions as the user or service account running VIGIL.

Before enabling tools for shared or remote workflows, review the configured
toolsets, filesystem access, working directory, environment variables, and
dashboard bind address.

## Vulnerability Reporting

This repository is private. Report vulnerabilities to the repository owner by
private GitHub issue, private security advisory, or direct owner contact. Include
the affected commit, reproduction steps, expected impact, and whether any
credential rotation is required.
