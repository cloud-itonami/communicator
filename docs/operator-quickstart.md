# Operator quickstart

Every step below was actually executed on 2026-08-25 (Node v26.7.0 /
npm 11.19.0, macOS) against commit `f591c8f`. Observed outputs are quoted
as measured — if a step stops matching, the repo has drifted, not this page.

## What you are operating

This repo is the **data plane** of the communicator control plane: the
TypeScript package under `kotoba/` fronts four record families on the
`@etzhayyim/sdk` substrate (kotoba-E2E split, ADR-2605181100):

| family | path | what it holds |
|---|---|---|
| `policyProfile` | plaintext | per-tenant policy reference config |
| `conversationStageEvent` | plaintext | ops timeline (INTAKE … CLOSED stage transitions) |
| `conversationParty` | E2E sealed | per-person PII |
| `messageRecord` | E2E sealed | draft/delivery payload + emotion analytics |

What is **not** here, by design: the Gmail/Outlook SEND action, LLM draft
inference, and provider OAuth token custody stay on the etzhayyim side and
are consumed via consent-capability (see `kotoba/src/registry.ts` header).
You cannot send mail from this repo, and a quickstart that claimed you
could would be lying.

The wire contract for the surrounding services is `proto/v1/communicator.proto`;
component boundaries are in `appview/README.md`.

## Prerequisites

- Node.js with npm (measured: Node v26.7.0, npm 11.19.0)
- Network access to github.com — both dependencies are git deps
  (`@etzhayyim/sdk`, `@etzhayyim/sdk-mock`), pinned to exact commits in
  `kotoba/package.json`

## Steps

```bash
git clone git@github.com:cloud-itonami/communicator.git
cd communicator/kotoba
npm install        # first run takes minutes: npm clones and builds the
                   # sdk's transitive git deps (measured ~7 min, loaded host)
npm run typecheck  # tsc --noEmit          → exit 0
npm test           # vitest run            → Test Files 1 passed, Tests 8 passed (8)
```

Measured test output:

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  413ms
```

The 8 tests exercise register/dedupe/validate/get/list for the plaintext
families and sealed write/read + coverage for the E2E families, against
`MockEtzhayyim` — no live substrate, no credentials, no network at test time.

## Expected warnings (measured, harmless for this path)

`npm install` prints `npm warn install-scripts` for
`@etzhayyim/ipfs` / `@etzhayyim/pqh` / `@etzhayyim/witness-quorum`
(`prepare: tsc` blocked by npm's default script policy) and
`@signalapp/libsignal-client`. The suite passes without approving any of
them — the mock-backed test path does not reach those packages. Do not
`npm install-scripts approve` anything just to silence the warning.

## Troubleshooting: `EALLOWSCRIPTS` on install

If `npm install` fails with

```
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
```

your **user-level** npm config has an `allow-scripts` entry (check
`~/.npmrc`). npm ≥ 11.19 propagates it via environment into the inner
install that prepares git deps, where it is read as a CLI flag and
rejected. Measured workaround — point the user config elsewhere for this
one command:

```bash
touch /tmp/empty-npmrc
NPM_CONFIG_USERCONFIG=/tmp/empty-npmrc npm install
```

This does not weaken any script policy; it only stops the user-level
entry from leaking into the git-dep preparation step.

## Not yet operable

`policy-check-component` is planned (see README) and has no code here.
`MIGRATION-TODO.md` tracks the remaining substrate-boundary items
(DID-bind auth review); the ad-pixel codemod is already closed.
