# Blue-and-black visual redesign

## Goal
Restyle the existing trading notes experience to match the reference site's sharp blue-and-black aesthetic without changing note creation, account sync, sharing, image attachments, or photo export behavior.

## Changes
- Replace the current green-and-amber palette with a deep black/navy base, electric blue accents, cool white text, and restrained blue glows.
- Refine page backgrounds, panels, input fields, buttons, borders, status labels, and saved-note tiles into a cohesive trading-dashboard look.
- Update the header and editor hierarchy to feel more structured and premium while preserving every current action and field.
- Carry the same styling through the sign-in page, shared-note page, live note card, and exported note image.
- Keep layouts readable and usable on both narrow and wide screens.
- Complete each page's social and search metadata while preserving the existing app identity.

## Technical details
- Define all visual values as semantic OKLCH tokens in the global design system.
- Reuse existing interface controls and update presentation classes only.
- Keep normal opaque PNG exports and change their backing color to the new dark theme.
- Validate the running site at desktop and mobile sizes, including note editing and export-card rendering.
