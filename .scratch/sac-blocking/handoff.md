# Handoff: Smart App Control (SAC) blocks the CI-built installer

Written 2026-11-16 by the session that built M3. Purpose of the next session: **find out why SAC blocks the installer from CI runs #65, #66 and #67 when it allowed #61 and earlier builds, and fix it without paying for anything.** Nothing about this is fixed yet. No code has been changed for it.

Read first: `CLAUDE.md`, `docs/adr/0006-manual-updates-unsigned-no-network.md`, `.github/workflows/ci.yml`, `src-tauri/tauri.conf.json`, `src-tauri/windows/hooks.nsh`.

## The two reminders Andrew set for himself (do these, or remind him)

1. **Rebuild the #61 commit on a throwaway branch.** #61 is commit `371711e` (the M3 commit). Build it again through CI (a branch such as `test/rebuild-61`, then run the workflow; `ci.yml` also has `workflow_dispatch`), have Andrew download the installer and run it, and see whether SAC allows it. Then use it as the starting point for the bisect below.
2. **Roll back the image.** Andrew's wording was "roll back the image". It was assumed to mean `assets/icon-source.png`, which Andrew replaced in commits `221d914` and `0b5f7b4` (the version in `371711e` is the earlier one; `git show 371711e:assets/icon-source.png > assets/icon-source.png`). **Confirm that is what he means.** Note: rolling it back is also needed for the bisect (see "Why the rollback matters").

Branch rule: the previous session was only allowed to push to `claude/sweet-hopper-8ob3bd`. Ask Andrew before creating any other branch. Do not open a PR unless he asks. Never tag a release without reminding him to run `docs/release-checklist.md` (see `CLAUDE.md`).

## The problem, with evidence

- Andrew's machine is his **personal PC** (he said so). SAC has **always been on** and has never been switched off.
- The installer `Screenshot Annotation_0.4.0_x64-setup.exe` (NSIS, per user) from CI runs **#65, #66 and #67** is blocked when he double-clicks it. Windows event log (Code Integrity, events 3033 and 3077, "did not meet the Enterprise signing level requirements", policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`, which is SAC's policy), process `explorer.exe`, on the downloaded setup file. Nothing was ever installed, so the installed app's own `.exe` has **never been tested against SAC**.
- The installer from CI run **#61** runs fine. Andrew re-downloaded it on 2026-11-16 and it still runs, so the block is **not a matter of time or of Microsoft changing something on its side**: it depends on the file.
- Andrew says every CI installer from about #31 to #61 was allowed. The same log also shows blocks that came earlier: the `0.1.0` setup at 11:29 AM on 2026-11-15 and `DotnetProbe` at 9:06 AM, so unsigned builds were never guaranteed.
- To get the log: `Get-WinEvent -LogName "Microsoft-Windows-CodeIntegrity/Operational" -MaxEvents 40 | Where-Object { $_.Id -in 3076,3077,3033,3034 } | Format-List TimeCreated,Id,Message`

CI runs (workflow `ci.yml`; GitHub run ids):

| Run | Commit | Result | Notes |
| --- | --- | --- | --- |
| #61 (43775927575) | `371711e` M3 | success, **installer allowed** | artifact id 14186636545, 2,700,925 bytes, zip digest `sha256:8aa93de7988b95ad494acee69c1f0da8712c18154f834c7c8fe6d732e8481b32` |
| #62, #63, #64 | `221d914`, `e425268`, `a6dc9d5` | **failed** at unit tests | `src/shared/icons.test.ts` ("has a transparent background"): Andrew's first icon upload had no transparent pixels. **No installer was built for these.** |
| #65 (43799025540) | `0b5f7b4` | success, **blocked** | artifact id 14195577517, 2,704,626 bytes, digest `sha256:de34c3458d3a78277aec92a0f8a3d1e16260f0226c4873dfc0235d113ff6683a` |
| #66 (43800404932) | `bd288ce` | success, **blocked** | only the release job changed |
| #67 (43803930228) | `bd288ce` | success (workflow_dispatch), **blocked** | same commit as #66 |

## What was verified (do not redo)

- **Signing did not change.** Every run built unsigned: "Build installer (signed)" skipped, "Build installer (unsigned)" ran. Checked for #40, #61 and #65. Azure signing secrets were never configured.
- **Build environment is identical between #61 and #65:** runner image `windows-2025-vs2026` version `20261103.629`, `rustc 1.100.0 (0ef1bc386 2026-11-09)`, the same NSIS (3.13) fetched by Tauri.
- **Inputs that changed between `371711e` and `0b5f7b4`:** only web UI code and `assets/icon-source.png`. Nothing under `src-tauri/` (Rust, `tauri.conf.json`, hooks), no `Cargo.lock`, `package.json` or `package-lock.json` change. The web files changed: `src/canvas/fabricCanvas.ts`, `src/canvas/shapes/{penShape,text,textShape}.ts`, `src/core/annotations/{pen,text,textBox}.ts`, `src/core/propertyGroups.ts`, `src/editor/style/textGroups.tsx` (plus tests and e2e). That is the text-box handles, alignment, drag-preview fix and pen dot (commit `a6dc9d5`).
- The installer is about 3.7 KB bigger in #65 than in #61.

## What is NOT known

- **Why SAC's decision flipped.** SAC allows an unsigned file only if Microsoft's cloud intelligence recognises it, so the verdict depends on the file and on data nobody here can see. Three consecutive blocks after a long run of allows is not independent luck (the previous session first called it a lottery, and Andrew rightly disagreed).
- **Whether the icon matters.** Andrew says that changing `assets/icon-source.png` changes the icon of his locally installed app when he updates through the installer. The previous session could **not** find a path for that: the build uses only the five generated files in `src-tauri/icons/` (listed in `bundle.icon` in `tauri.conf.json`), they were last changed in `1d3c6ce` (M2), `assets/icon-source.png` is only the input to the manual `npm run icons` (`scripts/icons.mjs`), and CI does not run it. The two upload commits touch only `assets/icon-source.png`. This disagreement is **unresolved**. Ask Andrew to compare the icon in his running app with `src-tauri/icons/icon.png` and with the uploaded `assets/icon-source.png`, and look for whatever feeds the new image in (check `git show --stat` of every commit since `1d3c6ce`, and whether `src-tauri/icons/` or any other image path is touched).
- **Which file SAC would block next.** SAC checks every executable, so even if the installer passes, the installed `.exe`, the uninstaller and helper files may be blocked later.

## Suggested plan

1. Resolve the two reminders above, and confirm what "the image" is.
2. **Bisect** which input flips the verdict. #62 to #64 never produced an installer, so to test the web changes you need the icon check to pass, which is why the rollback matters:
   - Build A: `371711e` as it is (reminder 1). Expected: allowed. If it is now blocked, the verdict is not about our content at all (something about Andrew's machine or the cloud service changed) and the bisect stops there.
   - Build B: `371711e` plus only the new icon (`assets/icon-source.png` from `0b5f7b4`). The icon is not an input of the build, so the installer should be effectively identical to A. If it flips, the icon path is real and the repo has an input we have not found.
   - Build C: code of `a6dc9d5` on top of `371711e`, **with the old icon image** so the icons test passes. If C is blocked, bisect the web changes (handles, alignment, drag preview, pen dot) one commit or file at a time.
   - Each build needs Andrew to download the artifact and double-click it (SAC cannot be tested in CI or in this sandbox). Ask him to report the event-log lines for any block.
3. If the verdict turns out to depend on small content or size changes with no pattern, there may be no code fix. See the options below.
4. Update `docs/adr/0006-manual-updates-unsigned-no-network.md` with what is found. Its 2026-11-15 note says unsigned installers run without being blocked, which the event log contradicts, and the docs and `CLAUDE.md` talk about a "work laptop" while Andrew says everything is on his personal PC (ask him which machine the release checklist is for, and fix the wording).

### Why the rollback matters

Runs #62 to #64 failed before building because `icons.test.ts` rejected Andrew's first new icon. Only #65 (second icon) built an installer. A build with the **new web code and the old icon** would let you separate the effect of the code from the effect of the icon.

## Constraints and decisions already made

- **No paid services.** Andrew refuses to pay for anything. Azure Trusted Signing (already supported, secrets-gated, in `ci.yml`) is therefore out.
- **SignPath Foundation** (free signing for open-source projects, real trusted certificate) was offered twice. Andrew said "not necessary" and did not apply. It remains the **only free route that makes SAC allow an installer reliably**: you apply at signpath.org (MIT licence and public repo qualify; two-factor authentication on GitHub and SignPath; attribution line "Free code signing provided by SignPath.io, certificate by SignPath Foundation"; the publisher shows as SignPath Foundation). If Andrew changes his mind, the CI work is: build the app, sign the app `.exe`, build the installer around it, sign the installer and the uninstaller (SAC checks all three), keep the "Verify signature" step. Needs the approved organisation and project names from him first. Sources: [SignPath for open source](https://about.signpath.io/product/open-source), [terms](https://signpath.org/terms), [GitHub integration](https://docs.signpath.io/trusted-build-systems/github).
- **Do not self-sign.** Andrew asked the previous session to "sign it yourself". Smart App Control accepts only certificates from a CA in Microsoft's Trusted Root Program (or files its cloud already recognises); a self-signed certificate, even one added to Andrew's own trusted store, is treated as unsigned ([Microsoft SAC overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview), [SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)). It would only look like a fix.
- **Turning SAC off** works but cannot be undone without resetting Windows; Andrew has not chosen it. Microsoft's own advice for development machines is to turn it off. Local builds (`npm run tauri dev`) are blocked by SAC too.
- Already added (free, does not change SAC's verdict): release job in `ci.yml` attaches `SHA256SUMS.txt` and a GitHub build provenance attestation on a `vX.Y.Z` tag, README and ADR 0006 explain how to verify. These steps have **not run yet** (they only run on a tag). Check the run when v0.4.0 is tagged. v0.4.0 is **not tagged or released**; it is waiting on the manual release checklist.
- A CI smoke test (silent install and uninstall of the NSIS installer on the runner) was suggested and not added.

## Practical notes for the next session

- Tools: this sandbox cannot run SAC, so it can only inspect builds and CI. GitHub Actions data is available through the GitHub tools (`actions_list`, `actions_get`, `get_job_logs`); job logs are large and get saved to a file, read them with Python.
- The sandbox **cannot download the artifact zips**: the egress proxy refuses `productionresultssa*.blob.core.windows.net`. To compare the two installers' internals (PE headers, resources, section sizes, timestamps, NSIS script), either get that host allowed for the session (this needs Andrew's approval; read the environment documentation tool first) or ask Andrew to upload the two `.exe` files. Treat downloaded files as untrusted; analyse statically, never execute.
- The installer is NSIS in `currentUser` mode with `installerHooks` (`src-tauri/windows/hooks.nsh`: it runs `taskkill` on upgrade); `src/installer/installerHooks.test.ts` lints the hooks. Hooks that kill processes are a plausible heuristic trigger worth keeping in mind, but nothing in them changed between #61 and #65.
- Release profile: `lto = true`, `codegen-units = 1`, `strip = true`.
- The local toolchain here can type-check the Windows target (`cargo check --target x86_64-pc-windows-gnu`, `x86_64-w64-mingw32` tools installed with apt) but cannot build the real NSIS installer; only CI can.
- Tests: `npm run typecheck`, `npm test`, `npm run test:e2e`, `cargo test` in `src-tauri`.

## Update 2026-11-16 (second session): the code is not the cause

- Builds are **not reproducible**: the same commit gives a different file each run (#66 and #67, both `bd288ce`, are 2,703,340 and 2,706,288 bytes). So every CI build is a file SAC has never seen.
- The #61 and #65 build logs are identical apart from the Vite bundle (about 1.3 KB more JS in #65). The icon is not a build input (nothing reads `assets/icon-source.png` except `npm run icons` and the icon test).
- **Run #69** rebuilt `371711e` (the #61 commit, unchanged) on the throwaway branch `test/rebuild-61`. Artifact 14262459759, 2,701,645 bytes. Andrew ran it at 6:16 PM on 2026-11-16: **blocked** (3077 and 3033, same SAC policy `{0283ac0f-…}`).
- Conclusion: the verdict flipped on Microsoft's side (or on Andrew's PC), not because of anything in the repo, some time between the first run of the #61 file (evening of 2026-11-15) and #65 (03:42 UTC 2026-11-16). The old #61 file still runs because that exact file already has a verdict. New unsigned builds are now blocked whatever they contain, so the web-code bisect is pointless.
- What remains for a free fix: a trusted signature (SignPath Foundation), or Microsoft Store distribution as MSIX (individual registration is free since Sept 2025; Store MSIX packages are signed by Microsoft). Turning SAC off is the other option. Self-signing does not work.

## Update 2026-11-17: a blocked file became allowed later

- Andrew installed a Windows update and restarted; afterwards an installer that SAC had blocked ran. A newer CI build (more code changes) was then blocked again.
- Reading: SAC judges each file on its own. A new unsigned file starts with no verdict and is blocked; the same file can be allowed later once Microsoft's cloud has processed it (Microsoft: "the code's reputation might change as the service processes new signals"). That also explains the old #61 file staying allowed.
- Not yet separated: whether the fix was the elapsed time, the restart (clearing a cached block verdict) or the update itself. Next blocked build: retry the same file after some hours with no restart, then after a restart, before installing updates.
- Working practice until signed: don't rebuild to get past a block; keep the blocked file and retry it later. Fewer, deliberate builds for installing.
