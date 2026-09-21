# Simple trading account linker

## Goal
Replace the current technical connection form with a compact, easy account-linking flow for MT4 and MT5.

## Changes
- Add a clear “Link trading account” action on the journal.
- Use a short form for platform, account name, login, broker server, and investor password.
- Explain only the essential security detail: use the read-only investor password when available.
- Show simple progress states: linking, waiting for broker, connected, or action required.
- Keep retry, sync, and disconnect controls on each linked account.
- Reuse the existing secure MetaApi connection and automatic trade import.

## Verification
- Test signed-out and signed-in states.
- Check the linker and account status cards on desktop and mobile.
- Confirm the app builds without errors.

## Limitation
MetaApi must have an active funded plan before it can deploy and connect broker accounts; the app will show that requirement clearly when applicable.
