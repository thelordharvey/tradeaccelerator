# Trading journal dashboard and MT4/MT5 sync

## Goal
Turn the existing notes experience into a blue-and-black trading workspace based on the attached dashboard, while preserving notes, pictures, account backup, sharing, and photo exports. Add a journal that automatically imports trades from connected MetaTrader 4 or 5 accounts.

## Experience
- Make the first screen a compact trading dashboard with Net P&L, win rate, profit factor, and open-trade summaries.
- Add an equity curve, account connection status, asset-class breakdown, and a searchable trade history.
- Keep the current note editor as a dedicated Notes view, with notes attachable to imported trades.
- Use the reference’s black canvas, electric-blue highlights, fine borders, squared data panels, condensed labels, and restrained cyan/green status colors.
- Keep the design usable on narrow screens by stacking summaries and turning dense tables into readable trade rows.

## MT4/MT5 connection
- Add a signed-in account connection flow for MetaTrader login, broker server, platform version, and a read-only investor password where supported.
- Send credentials only to the selected broker bridge from protected server code; never store broker passwords in the browser or app database.
- Save only the external connection ID and safe account metadata in the user’s private account.
- Automatically synchronize open positions, closed trades, symbols, timestamps, volume, prices, fees, and realized P&L.
- Provide connection states for connecting, deploying, syncing, connected, failed, and disconnected, plus manual refresh and disconnect actions.
- The live connection becomes active after the broker-bridge API token is securely added. Until then, the dashboard uses clearly labeled sample data and the Connect action explains what is missing.

## Data and safety
- Add private account, trade, and trade-note-link records with account-owner-only access rules.
- Keep all current note data and sharing formats compatible.
- Make synchronization idempotent so repeated imports update the same trade rather than creating duplicates.
- Treat imported trades as source records; personal notes remain editable without changing broker history.

## Technical details
- Use protected server functions for account setup, refresh, disconnect, and private journal reads.
- Use a verified public callback endpoint only if the selected MT4/MT5 bridge requires webhooks, with signature or shared-secret verification.
- Store the bridge token in Lovable’s secure secret storage after the provider and API contract are confirmed.
- Define all visual values as semantic OKLCH tokens and use the existing interface controls.
- Complete unique metadata for the dashboard, notes, sign-in, and shared-note pages.

## Validation
- Verify sign-in boundaries, private account isolation, duplicate-safe synchronization, failed-connection handling, notes, sharing, and opaque photo export.
- Check the dashboard and note editor at desktop and mobile sizes.
