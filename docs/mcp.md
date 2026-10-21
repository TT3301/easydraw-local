# Local MCP setup

[English README](../README.md) · [中文说明](../README.zh-CN.md)

EasyDraw Local exposes canvas tools to clients supporting **stdio MCP**. The
sidecar talks to an authenticated WebSocket bridge bound to `127.0.0.1`.
There is no public MCP endpoint or backend to deploy.

## Connect a client

1. Start EasyDraw Local and create or open a project.
2. Open **AI** and turn on **Allow MCP access**.
3. Choose **View setup guide** or **Copy connection info**.
4. Use the generated launch command, arguments, and environment in your client's
   MCP configuration. Different clients use different configuration formats.
5. Reload the client and ask it to call `get_capabilities`, then `get_project_tree`.
   Verify the active project before allowing edits.

Use the generated paths rather than copying a developer's machine-specific
configuration. The application works without npm on PATH when packaged.

The discovery file path is configuration; its contents include a temporary token.
Do not paste the file contents into an issue, commit them, or forward them to an
untrusted client. Turning MCP off disconnects clients and revokes access.

## Drawing skill

The bundled `skills/easydraw-product-sketch/` directory contains an optional
product-interface sketch workflow. Use **Update Skills** to copy the skill to
your user's shared agent skills directory, or give **Copy skills directory** to
an agent and let it install the complete directory in a supported location.

The skill is plain text guidance, not an AI model. Installing it does not install
an agent or grant MCP access by itself.

## Privacy

A connected agent can read and modify the open project and access canvas assets
through the available tools. External agents and model providers are controlled
by the user, not by EasyDraw Local. Review their privacy settings before sharing
sensitive content.

## Troubleshooting

- **No connection:** check the AI access switch, restart the client, and regenerate
  connection information after moving the app or source checkout.
- **No active project:** create or open a project in the desktop first.
- **Browser preview:** local desktop APIs and MCP access are not available there.
- **Moved skill:** copy the whole skill directory, including its references.
- **A stale client is still listed:** turn MCP off and on to revoke all old connections.
