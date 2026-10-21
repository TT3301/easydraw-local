# Security

EasyDraw Local stores projects on the user's computer and does not include a
hosted account, sharing, or upload service. This is not a guarantee that arbitrary
project files, SVGs, embedded content, or external AI clients are safe.

- Open files and connect MCP agents only from sources you trust.
- MCP is off by default and uses an authenticated loopback bridge when enabled.
  A connected client can read and modify the active project.
- External AI clients may send content to remote providers under their own policies.
- Do not publish project contents, home-directory paths, live MCP discovery tokens,
  or credentials in issues or screenshots.
- Signing and notarization are not configured in this source repository.

## Dependencies

Run `npm audit` when updating or distributing this application. A passing build
or test suite is not a security certification.

The optional local Mermaid-to-diagram conversion currently inherits upstream
audit advisories in its parser/rendering dependency tree. This feature can also
be reached when pasting Mermaid text. Avoid converting untrusted Mermaid input.
No forced major-version dependency overrides are applied to hide these findings;
upstream fixes should be integrated and tested as they become compatible.

## Reporting

Use the repository's private vulnerability reporting channel if the maintainer
has enabled it. Otherwise, request a private contact method without posting
exploit details or sensitive files in a public issue.
