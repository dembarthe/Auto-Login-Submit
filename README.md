# Auto Login Submit (Chrome / Edge, Manifest V3)

Auto-submits login forms once your password manager has filled them, **only on whitelisted domains**.

## Build (any machine with Docker)
    docker compose run --rm build
Outputs `dist/unpacked/` and `dist/auto-login-extension.zip`.

## Install
Open `chrome://extensions` (or `edge://extensions`), enable Developer mode, **Load unpacked** → select `dist/unpacked`.

## Use
- Toolbar popup: enable/disable the current site.
- Options page: edit the whitelist (`example.com` covers subdomains) and the submit delay.

## Safety behaviour
- Does nothing unless the host is whitelisted; HTTPS (or localhost) only; top frame only.
- Only submits forms with exactly one visible, filled password field (skips sign-up/change-password forms).
- Submits at most once per 30 s per tab/origin to avoid loops and account lockouts on failed logins.
- Stops as soon as you type in a field yourself, so a half-typed password is never submitted.

## CI / publishing (GitHub)
- `ci.yml`: validates and packages on every push/PR (zip available as a workflow artifact), checks the Docker build, reviews new dependencies on PRs.
- `codeql.yml`: CodeQL security scan of the JavaScript and of the workflows (push, PR, weekly).
- `dependabot.yml`: weekly updates for the pinned GitHub Actions and the Docker base image.
- `release.yml`: bump `version` in `src/manifest.json`, commit, then `git tag vX.Y.Z && git push --tags`. It creates a GitHub Release with the zip and, if configured, uploads and publishes to the Chrome Web Store.

### Chrome Web Store setup (once)
1. Upload the first version manually in the [developer dashboard](https://chrome.google.com/webstore/devconsole) and fill in the listing (the API can only update an existing item).
2. Create OAuth credentials and a refresh token for the Chrome Web Store API (see <https://developer.chrome.com/docs/webstore/using-api>).
3. In the repository, create an environment named `chrome-web-store` (ideally with a required reviewer) holding the secrets `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

Without those secrets the store job is skipped and only the GitHub Release is created.


## Information

The application was coded using Sonnet 5.5, and reviewed for security by Fable 5.2 and DeepSeek V4.1 Flash. The misconfiguration identified by Fable 5.2 are fixed, while the DeepSeek V4.1 Flash are documented in [security_audit/README.md] and not implemented.