Trace an IPC channel from renderer to main process and back.

Given an IPC channel name, trace the full flow:
1. Find the IPC handler in `desktop/src/main.ts`
2. Find the preload bridge in `desktop/src/preload.ts`
3. Find any renderer-side calls in `desktop/src/renderer/`
4. Document the data flow: what's sent, what's returned, what side effects occur

Report the complete chain so we understand exactly what happens when this IPC is invoked.

$ARGUMENTS
