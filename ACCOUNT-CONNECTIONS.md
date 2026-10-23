<!-- Youbal said to fix: current connection navigation, tools, voice scope and verification limits. -->
# Account connections

Open **Connections** from the profile menu under your name, or **Settings → Agents → Connections → Manage**. Account support originated during private development; this guide describes the current source. Then choose a connection and model in an agent profile. Projects, work folders, notes, handoffs, and scheduled tasks use that profile's saved connection.

## ChatGPT account

Click **Continue with ChatGPT**. Complete sign-in and consent in your system browser, then return to the app. Eligible requests use your ChatGPT plan or credits when you grant plan usage permission. An identity-only grant cannot run agents.

The app implements the documented public-client flow: dynamic registration, a stable installation host ID, loopback callback on `127.0.0.1`, state and nonce verification, PKCE S256, signed OIDC identity verification, per-account registrations, serialized refresh-token rotation, and session revocation. Returning sign-ins reuse the issued client ID. Multiple accounts can be saved with distinct editable labels; each profile selects one explicitly.

The model picker reads the selected account's available catalog. Inference uses the public Responses API with `store: false` and `stream: true`, and requires the completed event before recording success. Usage-limit failures link to [ChatGPT usage settings](https://chatgpt.com/settings/usage). Enable or disable provider web search in each profile; model and account policy determine availability.

This flow does not import ChatGPT history, memory, voice, or ChatGPT connectors. Hosted MCP is not used on this plan-usage route. The app executes selected MCP function tools locally and returns their results to the model. Configure service access separately in Tools & MCP. Existing CLI profiles remain available for CLI tools and local attachments. Eligibility and app registration remain subject to OpenAI's current rollout and your account.

Official protocol: [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [accounts and renewal](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Google account / Gemini

1. In Google Cloud, enable the Gemini API, configure the OAuth consent screen and any required test users, and create an OAuth client of type **Desktop app**.
2. Download its client JSON. Choose **Connections → Gemini → Import Google OAuth JSON**.
3. Click **Continue with Google**, approve the requested API permissions, and return to the app.
4. Choose this Google connection and an available Gemini model in an agent profile.

The app uses Google's browser authorization-code flow with PKCE and validated OIDC identity, stores the credentials encrypted, renews access, and supports sign-out. The Cloud project ID is used for API quota attribution when present in the client JSON. Google OAuth configuration is not bundled in the source or executable. You may also connect a Gemini API key.

Google account identity and Gemini consumer-plan benefits do not automatically authorize or pay for external API requests. The selected Cloud project needs the applicable API access and billing. Provider Google Search grounding is optional; returned sources and search attribution appear with the response.

Official setup: [Gemini OAuth](https://ai.google.dev/gemini-api/docs/oauth), [Google AI plans and external API usage](https://ai.google.dev/gemini-api/docs/google-ai-plans).

## Claude account

Choose **Sign in with Claude Code**. Claude Code must already be installed and accessible as `claude`. The app runs its official `claude auth login` browser flow in the background, checks `claude auth status`, and keeps a separate `CLAUDE_CONFIG_DIR` per connection. No terminal interaction is required in the app. Existing CLI authentication is left in its own configuration directory.

Select **Claude account · Installed Claude Code** in an agent profile and choose the saved connection. Model aliases or identifiers are still entered in the CLI model field; Claude account catalogs are not discovered through an undocumented endpoint. Tool permissions belong to this isolated CLI configuration. Selected app-managed MCP connections are supplied through a private temporary configuration; existing CLI configuration is also discovered. Configure defaults through the profile and Tools & MCP. The app does not extract Claude subscription tokens or impersonate another OAuth client.

Alternatively, choose **Connect Claude API key** for direct Messages API access and account-specific models. That adapter uses API billing, text context, notes, delegation, and schedules. It supports the app’s selected MCP function tools, with approval before calls. Selected built-in Read/Find/Search project-file tools and Web fetch are available to account/API agents. Provider-native web search is separate and depends on the adapter/model. The current Claude API prompt still says local-file tools are unavailable despite supplying them; this is a known source inconsistency, not a capability guarantee. Subscription eligibility and API credits depend on your Claude plan and provider policy.

Official references: [Claude CLI authentication commands](https://code.claude.com/docs/en/cli-reference), [Claude API authentication](https://platform.claude.com/docs/en/manage-claude/authentication), [Claude plan/SDK access](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

## API keys

Connections also supports OpenAI API, Claude API, and Gemini API keys. A key is checked through model listing without generating an AI response. Future agent requests use that provider's API billing. Invalid keys are removed rather than appearing connected. Signing out clears the key; add a new API connection to replace it.

## Storage and disconnecting

OAuth tokens, API keys, and Google desktop-client configuration are held in an app-private encrypted vault at `%APPDATA%\Daevu\auth\credentials.bin`. Electron `safeStorage` uses OS credential protection (Windows DPAPI). Connections are disabled if secure OS protection is unavailable; no plaintext fallback is used. The renderer and project JSON receive only account labels, connection IDs, status, and model catalogs. Claude Code owns its credential files in the isolated `auth\claude\<connection-id>` configuration directories.

Signing out stops the account's active research and attempts remote session revocation. Local credentials are cleared even if remote revocation cannot be confirmed; the app tells you to disconnect access in provider settings in that case. ChatGPT registration and the installation host ID are retained for reconnecting. Removing a connection also removes its saved registration. Existing research stays local. Scheduled tasks referencing a disconnected account fail visibly until you reconnect or change the profile.

Do not commit or share runtime auth folders. The app's source ZIP and EXE packaging include source/runtime files only; test profiles, tokens, and workspace data are excluded. Moving the encrypted vault to another Windows user or computer does not transfer the ability to decrypt it.

## Voice

Direct account/API agent adapters do not implement voice. Optional website plugins can expose the website’s own voice controls. Account sign-in does not embed a provider's consumer voice interface or guarantee Realtime/Live entitlement. Voice needs its own audio/session integration and supported credentials.

## Verification limits

Automated tests use signed mock OIDC tokens, real loopback callbacks, and deterministic provider responses. Native Electron checks exercise Windows encryption, IPC redaction, browser callback completion, the first-use plan notice, account/model profile selection, research execution, persistence, and sign-out. This audit did not perform live provider consent or paid inference. Automated fixture results do not establish account eligibility, quota, model access or tool compatibility; verify those with your own configured account.

## Service connections

AI-provider login and service authorization are separate. Tools & MCP includes a searchable public MCP directory, custom server setup, API tokens, and standard browser OAuth for compatible servers. No connections from ChatGPT, Claude, or Codex are imported by account login. A directory entry may require provider approval or a separate developer integration. MCP configs, tokens, and dynamic registrations use the device-local encrypted vault, outside project and Drive storage. The public catalog excludes endpoints containing secrets, tokens, command arguments, and environment values.

MCP and handoff verification uses real SDK transport and local callback fixtures with deterministic model responses. No real service consent or paid model inference is claimed by those tests.


## Shared Drive workspaces (v0.8.0)

Shared editing synchronizes research data through Drive, while account bindings, tokens, MCP configuration, and browser sessions stay on each device. Connect accounts and services separately on each PC. Connecting an account on one device does not overwrite another device's binding. Automatic schedules remain assigned to the PC that enabled shared editing to avoid duplicate scheduled work; manual research can run on both. See the [Drive guide](docs/GUIDE.md#google-drive-workspace-connection) for format upgrades and conflict recovery.


## Unified AI connections and custom services

Open **Connections → AI connections → Add connection**. OpenAI API, Claude API, Gemini API, OpenRouter, custom APIs, and supported account sign-ins share this dialog and one installed-connections list. Existing saved accounts remain available.

- **OpenRouter:** add your OpenRouter key, then choose OpenRouter and a discovered chat model in an agent profile. Keys are checked with `/api/v1/key`; catalogs are loaded without a generation. Tool-capable chat models support the workspace’s MCP and project functions. Turn off **Enable agent tools** for models that cannot call functions.
- **Custom API:** supply the base URL and select **Chat Completions** or **System One**. Model IDs can be discovered through `/models` or supplied manually. Manual IDs skip connection validation until the first model request. HTTP is allowed only on localhost; remote APIs require HTTPS. Redirects are rejected to avoid forwarding credentials to another host.
- **TypeSafe / Jev:** use the preset under Custom API. It fills `https://api.typesafe.ai/v1` and selects System One. Paste an API key from your TypeSafe console in the app’s password field. The key stays in the device’s encrypted credential vault. TypeSafe is a custom connection, not a separate chat-agent provider.

Use **Evaluate with Jev** on a connected decision-capable account to ask a yes/no probability, choose from options, or score against ordered criteria. Advanced mode accepts a map of typed questions as JSON. It shows structured answers and usage from the service. Evaluations incur the selected provider’s API usage.

To let an agent use Jev, open its profile’s **Jev decision tool**, select the custom decision connection (or OpenRouter), and enter the decision model ID. Defaults are `jev-latest` for TypeSafe and `~typesafe/jev-latest` for OpenRouter. The agent receives a `jev_decide` tool and supplies the evidence and typed questions. It remains disabled for profiles without a selected decision connection. Both account agents and Claude/Codex project-tool bridges can use it. Returned probabilities do not automatically authorize writes or override MCP permissions. System One connections are excluded from chat model selectors.

Jev is a structured decision model, not a source of free-form chat replies. The direct endpoint is `/v1/systemone`; OpenRouter uses `/api/v1/systemone`. See [TypeSafe’s API reference](https://docs.typesafe.ai/api), [TypeSafe model discovery](https://docs.typesafe.ai/models), and [Jev on OpenRouter](https://openrouter.ai/docs/guides/community/jev).

For the normal TypeSafe console interface, use **Add AI website** under Plugins with its URL. The same flow can host other HTTPS AI tools with their own controls and sign-ins. Embedded login depends on the website; use Open externally if its identity provider refuses an embedded session. Website access does not automatically grant an API key or an agent tool connection.

Validation uses mock responses and isolated local test accounts; no paid TypeSafe or OpenRouter request is made by the test suite.
