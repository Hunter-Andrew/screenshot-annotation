# Grilling: Choose the tech stack

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Using the research and the install test results, pick the stack, canvas library and installer format. Then write the stack ADR.

## Answer

**Tauri 2 with a per-user NSIS installer (`installMode: currentUser`), built on GitHub Actions.** Andrew chose it on 2026-11-14 after comparing it with .NET WPF. Both install identically on the work laptop (one setup .exe, no extra downloads). Tauri gets a better editor sooner thanks to web canvas libraries. Recorded in [ADR 0001](../../../docs/adr/0001-tauri-2-per-user-nsis.md).

The UI framework and canvas library were not decided here; they're split out to the UI framework and canvas library ticket.
