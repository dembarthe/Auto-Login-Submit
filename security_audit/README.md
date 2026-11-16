# Security & Code Review — Auto Login Submit 1.0.0

This is a public, unedited record of a static review of this extension. It is published for
transparency: I would rather show the weaknesses myself than have someone else find them quietly.

**No code was changed as part of this review.** Every finding below is a description and a
suggested direction, not an applied patch. The tree reviewed is exactly the tree you are reading.

---

## About this audit

| | |
|---|---|
| **Date** | 2026-11-16 |
| **Extension** | Auto Login Submit 1.0.0 (`src/manifest.json`) |
| **Reviewer** | AI model **DeepSeek V4.1 Flash Free** (`opencode/deepseek-v4.1-flash-free`) |
| **Harness** | [OpenCode](https://opencode.ai) coding agent, code/audit mode |
| **Method** | Manual static review of all source, build, CI and packaging files; syntax and integrity checks run locally |
| **Scope** | `src/*`, `dist/*`, `scripts/build.sh`, `Dockerfile`, `compose.yaml`, `.github/**`, `README.md`, ignore files |
| **Out of scope** | Runtime/dynamic testing in a browser, password-manager integration behaviour, Chrome Web Store policy review, dependency CVEs |

### What was actually run

- `node --check` on all four JavaScript files — pass
- JSON parse of `src/manifest.json` — pass
- `diff -rq src dist/unpacked` — identical
- `unzip -l dist/auto-login-extension.zip` — `manifest.json` at archive root, 12 entries
- `file src/icons/*.png` — 16/32/48/128 px, all present
- Exercised `ALS.normalize()` / `ALS.matches()` in a Node `vm` sandbox with representative inputs
  (the results quoted below are real outputs, not guesses)

### Honest limitations

This is a **source-only, AI-generated review**, not a penetration test or a formal audit. It did
not execute the extension in Chrome, did not test against real password managers (Bitwarden,
1Password, Chrome's built-in manager), and did not attempt any live exploitation. There are no
unit tests or linters in the repo to lean on, so there is no safety net confirming these
observations. Treat severity ratings as informed judgement, not CVSS scores. If you are relying on
this for anything important, have a human re-verify the two High findings independently.

---

## Executive summary

The design is conservative and the supply-chain hygiene is better than most extensions of this
size: whitelist-gated, HTTPS-only, top-frame-only, one visible filled password field, skips
`new-password`, submits via `requestSubmit()`, and refuses to run when it cannot write its loop
guard. There is no `innerHTML` anywhere, so whitelist data cannot become script.

Two findings are worth treating as real risk rather than style notes:

1. The extension submits whichever form holds the filled password field **without checking where
   that form posts to**, so an injected/modified form can send the password to a third-party origin.
2. Whitelist validation accepts **public suffixes** such as `co.uk` or `github.io`, which would
   enable auto-submit on every user-controlled subdomain beneath them.

Everything else is robustness, privacy surface, performance, or developer experience.

| ID | Severity | Area | Location |
|---|---|---|---|
| AL-01 | High | Unverified `form.action` (off-origin credential submission) | `src/content.js:39-46` |
| AL-02 | High | Public-suffix domains accepted by whitelist | `src/common.js:7-10` |
| AL-03 | High | "Filled" ≠ "password-manager filled"; autofill test is dead code | `src/content.js:19-22` |
| AL-04 | High | Content script injected on every HTTPS page; `activeTab` redundant | `src/manifest.json:8,11` |
| AL-05 | Medium | Hidden/off-screen fields count as visible | `src/content.js:14-18` |
| AL-06 | Medium | Any keystroke in any input cancels the feature | `src/content.js:58-64` |
| AL-07 | Medium | Layout thrash: whole-document observer + 500 ms poll | `src/content.js:83-85` |
| AL-08 | Medium | Popup "Remove" can delete a broader whitelist entry | `src/popup.js:17-27` |
| AL-09 | Medium | Options page silently drops invalid input; no storage error handling | `src/options.js:7-14` |
| AL-10 | Medium | `delayMs` not clamped where it is consumed | `src/content.js:5,80` |
| AL-11 | Medium | Popup toggle is fire-and-forget; stale state on double-click | `src/popup.js:21-28` |
| AL-12 | Low | Loop guard uses page-readable `sessionStorage` | `src/content.js:9-12` |
| AL-13 | Low | Stored domains not normalized on read | `src/common.js:17-20` |
| AL-14 | Low | Build validation gaps | `scripts/build.sh:10,15` |
| AL-15 | Low | Docker build runs as root (root-owned `dist/`) | `Dockerfile:1-6` |
| AL-16 | Low | CI secrets on the `curl` command line; release/publish not ordered | `.github/workflows/release.yml:65-68` |
| AL-17 | Low | `dependency-review` lacks permission to comment | `.github/workflows/ci.yml:33-40` |
| AL-18 | Low | Packaging/HTML/metadata polish | various |

---

## High

### AL-01 — Form destination is never validated

**Where:** `src/content.js:39-46`

`submit()` takes the form that owns the filled password field and submits it, regardless of its
`action`:

```js
const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
...
if (typeof form.requestSubmit === "function") {
  try { form.requestSubmit(btn && visible(btn) && !btn.disabled ? btn : undefined); return; } catch {}
}
if (btn) btn.click(); else form.submit();
```

If the page is compromised — XSS, a malicious tag-manager/analytics script, or a hijacked
third-party dependency — the attacker can change the form's `action` to their own endpoint while
leaving the password field intact. The password manager fills the field based on **origin**, not on
form destination, and this extension then submits it to the attacker without any further user
action. That turns auto-submit into a credential-exfiltration primitive.

**Direction:** before submitting, resolve `new URL(form.action, location.href)` and require the same
registrable domain (or at least the same origin) as `location`. Skip the submission otherwise.
Consider also ignoring forms with `target` set to a different window name.

### AL-02 — Public suffixes are accepted as whitelist entries

**Where:** `src/common.js:7-10`

`normalize()` rejects bare TLDs (`com`) but has no Public Suffix List awareness. Real outputs from
the reviewed code:

```
"co.uk"            -> co.uk          (accepted — whitelists every *.co.uk)
"github.io"        -> github.io      (accepted — whitelists every user's site)
"1.2.3.4"          -> 1.2.3.4        (accepted — fine)
"com"              -> null           (correctly rejected)
"user@example.com" -> null           (correctly rejected)
```

Because `matches()` treats any entry as "this domain and all subdomains", whitelisting a shared
hosting suffix means auto-submitting credentials on a page a stranger controls. A phishing page on
`someone.github.io` or a subdomain of a shared platform would qualify.

**Direction:** reject entries that are public suffixes (use a PSL dataset or a short deny-list of
known shared suffixes), and/or make subdomain matching opt-in per entry. At minimum, warn in the
options UI.

### AL-03 — "Filled" is not the same as "autofilled"

**Where:** `src/content.js:19-22`

```js
const isFilled = (el) => {
  if (el.value) return true;
  try { return el.matches(":-webkit-autofill"); } catch { return false; }
};
```

The first line short-circuits, and an autofilled field necessarily has a non-empty `value`, so the
`:-webkit-autofill` test is unreachable in practice. The extension therefore cannot distinguish
"the password manager filled this" from "the page pre-filled this", "the browser restored this",
or "a script set this". Any non-empty password field is treated as a green light to submit.

Combined with AL-01 and AL-05, this is the difference between "convenience" and "the extension
posts whatever is in the box".

**Direction:** detect the fill event/attribute (`:-webkit-autofill` before checking `value`, or a
mutation/`input` event with `isTrusted`), require the field to be `type=password`,
not `readOnly`/`disabled`, and require a non-whitespace value.

### AL-04 — Every HTTPS page gets a password-field scanner

**Where:** `src/manifest.json:8,11`

```json
"permissions": ["storage", "activeTab"],
"content_scripts": [{ "matches": ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"], ... }]
```

Two consequences:

- At install, the extension requests host access to **all** HTTPS sites (Chrome surfaces this as
  "Read and change all your data on the websites you visit"). The whitelist is enforced in
  JavaScript at runtime, but the permission is still global.
- `common.js` + `content.js` execute on every HTTPS page, each doing an async
  `chrome.storage.sync.get` and then, on whitelisted sites only, the 500 ms scanner. Most page
  loads pay for a storage read and a content-script injection they never need.

Separately, `activeTab` is redundant: content-script host permissions already allow the popup to
read `tab.url`, and `activeTab` grants nothing additional here.

**Direction:** move the whitelist into `host_permissions`/`optional_host_permissions` and register
content scripts dynamically per site with `chrome.scripting.registerContentScripts()`, updating the
registration when the whitelist changes. Drop `activeTab`. This reduces the install-time warning,
avoids injecting into unrelated sites, and is generally reviewed more kindly by the Web Store.

---

## Medium

### AL-05 — Hidden fields can be treated as visible

**Where:** `src/content.js:14-18`

`visible()` checks `getBoundingClientRect()` area plus computed `visibility`/`display`. It does not
catch `opacity: 0`, `transform: scale(0)`, or off-screen positioning such as
`position:absolute; left:-9999px` — all of which keep a non-zero rectangle. A decoy form can
therefore be considered fillable and submittable. The helper is also invoked twice per candidate,
and `readOnly`/`disabled` fields are not excluded.

**Direction:** prefer `el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })`,
cache the rect, and skip disabled/read-only inputs.

### AL-06 — Typing anywhere cancels auto-submit

**Where:** `src/content.js:58-64`

```js
addEventListener("keydown", onUserInput, true);
```

The handler stops everything on any trusted `keydown` whose target is an `HTMLInputElement` — not
just the login form's fields. Typing into an unrelated search box, a comment editor, or a chat
widget therefore permanently disables auto-submit for that page load. `paste` and IME composition
are not handled at all, so pasting a password never cancels the pending submit.

**Direction:** scope the listener to the detected form's inputs, and also listen for
`paste`/`beforeinput` (or just verify the password field's value is unchanged at submit time, which
the code already partially does).

### AL-07 — Layout thrash on busy pages

**Where:** `src/content.js:83-85`

```js
const observer = new MutationObserver(attempt);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
const poll = setInterval(attempt, 500);
```

`attempt()` runs on **every** mutation in the document (child list changes on any dynamic page),
and each run does `querySelectorAll` on password inputs plus `getComputedStyle` and
`getBoundingClientRect` — forced style/layout work. Add the 500 ms interval for 20 seconds (about
40 more passes) and this is measurable jank on heavy SPAs and dashboards.

**Direction:** debounce the observer (e.g. 100–250 ms), drop or lengthen the interval, and skip work
while `document.visibilityState === "hidden"`.

### AL-08 — Removing a site can remove more than the user expects

**Where:** `src/popup.js:17-27`

```js
const hits = domains.filter((d) => host === d || host.endsWith("." + d));
...
await ALS.setDomains(domains.filter((d) => !hits.includes(d)));
```

If `example.com` is whitelisted and the user opens the popup on `mail.example.com`, clicking the
button removes `example.com` and thereby disables auto-submit on `www`, `mail`, and every other
subdomain. The button label lists the hits, but it is easy to glance past.

**Direction:** offer "disable just this host" (add the exact hostname as an exclusion/override) or
at least confirm when the removal affects more than the current host.

### AL-09 — Invalid whitelist input is dropped silently

**Where:** `src/options.js:7-14`

Entries are split on newlines/commas and normalized; anything `normalize()` rejects disappears,
the textarea is rewritten with the survivors, and the page still says "Saved". Input such as
`a.com b.com` (space-separated) or `*.foo/bar` vanishes with no explanation. There is also no
`try/catch` around `chrome.storage.sync.set`, so a quota or sync error becomes an unhandled
rejection with no user-visible feedback.

**Direction:** show a list of rejected entries next to "Saved", and surface storage errors in
`#msg`. Consider splitting on whitespace as well as commas/newlines.

### AL-10 — `delayMs` is trusted at use time

**Where:** `src/content.js:5,80`

```js
const { delayMs } = await chrome.storage.sync.get({ delayMs: ALS.DEFAULT_DELAY_MS });
...
}, Math.max(0, Number(delayMs) || 0));
```

The options page clamps to 0–10000, but the consumer does not. Sync data restored from another
device, a manual edit, or a future code path can produce an arbitrary delay (`Number(x) || 0` also
silently converts `NaN` to 0). Clamp on read as well: `Math.min(10000, Math.max(0, ...))`.

### AL-11 — Popup toggle races

**Where:** `src/popup.js:21-28`

The click handler captures `on` and `domains` from the last `render()`, then awaits a storage write
and calls `render()` without awaiting it and without error handling. Two fast clicks operate on
stale state (harmless because of dedup, but the UI can end up inconsistent), and a storage failure
is an unhandled rejection.

**Direction:** disable the button during the write, `await render()`, and wrap in `try/catch`.

---

## Low

### AL-12 — The loop guard lives in page-readable `sessionStorage`

**Where:** `src/content.js:9-12`

```js
const KEY = "als_last_submit";
let last = 0;
try { last = Number(sessionStorage.getItem(KEY) || 0); } catch {}
if (Date.now() - last < 30000) return;
```

Content scripts share the page's `sessionStorage`. No secret is exposed, but (a) page script can
write a far-future timestamp to suppress auto-submit for that tab, and (b) the constant key name
acts as a fingerprint that the extension is installed. The guard is also per **tab**, so the same
login page in a second tab can submit again — consistent with the README, just worth being explicit
about.

**Direction:** keep the timestamp in the extension's own storage keyed by `tabId` (service worker)
or in a content-script-scoped variable plus a `chrome.storage.session` entry, and randomize nothing
— just avoid the page's storage.

### AL-13 — Stored domains are trusted verbatim on read

**Where:** `src/common.js:17-20`

`getDomains()` filters for strings only. `matches()` lowercases the hostname but not the stored
entry, so a hand-edited/stale uppercase entry never matches, and a stray `com` entry would whitelist
a whole TLD. Only this extension writes the keys today, so exposure is low — but it is cheap to
normalize on read as well as on write.

### AL-14 — Build validation gaps

**Where:** `scripts/build.sh:10,15`

- The version regex `^\d+(\.\d+){0,3}$` does not enforce Chrome's 0–65535 per part.
- `node --check` is syntax-only; there is no ESLint and no test suite anywhere in the repo.
- Manifest-referenced files are checked, but `<script src>` references in `options.html` and
  `popup.html` are not.
- Packaging copies whatever is in `src/`; a stray file would ship silently.

### AL-15 — Docker build runs as root

**Where:** `Dockerfile:1-6`

`FROM node:22-alpine` with no `USER`, and `compose.yaml` bind-mounts `./dist`. Files written by the
build are owned by root on the host, which surprises people and can break later local builds.
Use `USER node` with a writable `/app/dist`, or run with
`docker compose run --rm --user "$(id -u):$(id -g)" build`.

### AL-16 — Release workflow details

**Where:** `.github/workflows/release.yml:65-68`

- OAuth secrets are passed as `curl -d client_secret=...` arguments, which are visible in the
  runner's process list. Ephemeral runners make this low risk; `--data-urlencode` from a file or
  heredoc is cleaner.
- `::add-mask::` happens only after the token is obtained.
- `github-release` and `chrome-web-store` both `needs: build` and run in parallel, so a failed
  store publish still leaves a published GitHub Release. That may be intentional — just document it.
- Publishing has no retry/backoff for transient Google API failures.

### AL-17 — Dependency review cannot comment

**Where:** `.github/workflows/ci.yml:33-40`

The job runs with top-level `contents: read` only. `actions/dependency-review-action` needs
`pull-requests: write` to post its summary; without it the check still passes/fails on findings but
stays silent on the PR.

### AL-18 — Packaging and polish

- Icons are 16-bit-per-channel RGBA PNGs. Chrome accepts them, but 8-bit is the conventional and
  most portable form for store surfaces.
- `options.html` / `popup.html` have no `<html lang>` and no viewport meta (acceptable for fixed
  extension pages, still a lint nit).
- Buttons have no explicit `type="button"`; harmless today because neither page contains a
  `<form>`, but a future wrapper would change that.
- `minimum_chrome_version: 111` is higher than anything the code needs (roughly Chrome 96+ would
  suffice: `chrome.storage` promises, `requestSubmit`).
- No `short_name`/`homepage_url`/`author` metadata, which some store listings use.
- No tests and no linter means CodeQL is the only static check in CI.

---

## Verified as correct

These were explicitly checked and are not findings:

- `evilexample.com` and `evil-example.com` do **not** match a whitelist entry `example.com`
  (`endsWith("." + d)` is the right comparison).
- Bare TLDs (`com`) are rejected; `user@example.com` and non-ASCII input are rejected; `*.` prefixes,
  schemes, paths, query strings, trailing dots, and ports are normalized away correctly.
- `http://localhost/*` and `http://127.0.0.1/*` match all ports (match patterns are port-agnostic).
- `new-password` fields are skipped, and forms with more than one visible password field are skipped.
- `form.requestSubmit()` is preferred over `form.submit()`, so normal submit handlers and
  constraint validation run; the `form.submit()` fallback is only a last resort.
- The loop guard is written **before** submitting, and if `sessionStorage` is unavailable the
  extension refuses to submit rather than risk a loop.
- No `innerHTML`, no `eval`, no dynamic code, no remote resources. Popup and options render
  whitelist/host data with `textContent` only.
- MV3 defaults apply (no inline script); `dist/unpacked` matches `src` exactly; the zip has
  `manifest.json` at its root, which the Web Store requires.
- CI/CD: actions are SHA-pinned, `persist-credentials: false`, least-privilege top-level
  `permissions`, concurrency cancellation, and a tag-vs-manifest version check before releasing.

## Out of scope / not tested

- Live behaviour in Chrome/Edge, including real autofill timing for Bitwarden, 1Password, and
  Chrome's built-in manager.
- SPA/React login forms that are not wrapped in a `<form>` (the extension ignores them) and logins
  inside iframes (`all_frames: false`).
- Chrome Web Store policy compliance and review outcome.
- Dependency vulnerabilities (there are no runtime dependencies; Dependabot covers Actions and the
  base image, but no advisory scan was performed here).
- Any claim that a finding is remotely exploitable without a specific page-level
  compromise or a user whitelisting an unsafe domain.

## Disclosure

Nothing here is a secret vulnerability requiring coordinated disclosure: findings are design and
robustness issues in a local, user-installed extension, and several require the user to whitelist a
risky domain or the page to already be compromised. If you find something more serious, please
report it privately rather than opening a public issue.

Corrections are welcome. This review is a point-in-time snapshot by an AI model; it can be wrong,
and the code may have changed since.

---

*Audit artifact generated for this repository on 2026-11-16. No files outside this directory were
modified as part of the review.*
