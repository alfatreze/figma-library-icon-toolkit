# Figma Community listing (draft)

Update before publishing: mark Dev Mode and Labs as "new" until they have been tried in Figma (see `verification.md`), and replace the cover image.

## Tagline
Scan your icon library, fix what's wrong, and export clean, themeable files for developers: SVG, sprite, Angular, React and Web Components. Publish to GitHub or GitLab as a pull request. Read-only by default.

(Shorter: "From Figma icon library to developer-ready code. Scan, review, export.")

## Description
Icon Library Toolkit gets your icons from Figma to developers without the back-and-forth.

Pick some layers, a page or the whole file, and press Scan. The plugin finds your icons, shows each one at a readable size, and flags common problems such as text inside an icon, shadows, default layer names or duplicate names. When you're ready, choose the formats you need and download one ZIP with a short guide for developers inside, or publish it to GitHub or GitLab as a pull request.

Your file is never changed during a scan. A few optional features can edit it, such as turning a loose frame into a component. They stay off until you enable Labs, always show a preview first, and apply as a single undo step.

## Features by audience

### Designers
- Scan the selection, a page or the whole file.
- Large previews (S / M / L), a grid view, and a hover preview showing 16, 24 and 32 px on light, dark or checker backgrounds.
- An Issues tab with a short "How to fix" note per problem and one-click selection of the layer in Figma.
- Include or leave out icons; rename an icon for the export without touching Figma.
- Detects duplicate drawings, mismatched layer names that break colour overrides, and layers left out of the scan.
- Optional fixes (Labs): replace a detached icon with an instance, turn a frame into a component. Previewed, one undo.

### Design system managers
- Library health at a glance and a prioritised Issues list.
- Predictable names; choose how duplicates are handled (stop, add category, add number).
- Categories from your layer names, sections, frames or pages.
- "Changed since last time": new, renamed or redrawn icons, a suggested version number and a changelog. Baseline kept on your computer, in the file, or read from your repository.
- Renamed icons keep working under their old name for a while (deprecated aliases).
- Mark intentional duplicates so the artwork is stored once.
- Share settings with the team (settings file or published in the Figma file).
- Colours tied to your Figma variables and design tokens; stroke weight constant, scaling or by size.
- **Publish to GitHub or GitLab:** a new branch, one commit and a pull / merge request with a generated description; the default branch is never touched.

### Developers
- Formats: SVG files, SVG sprite, searchable preview page, Angular (17.1+ and 14+), React, Web Component, optional CSS masks and Code Connect templates.
- Themeable with CSS variables (colour, size, stroke width), multi-colour supported.
- Import only the icons you use; icons used by name load in small chunks; Angular sprite option; typed names.
- `icons.json`, a README and a guide for AI assistants in every export.
- Dev Mode: select an icon and copy code for Angular, React, HTML or Web Component; an inspect panel lists the icons in a selection and downloads a ZIP of just those.

## Privacy and network
Scanning, exporting and the Dev Mode features work offline. The plugin connects to the internet only when you press Test connection or Publish in the optional repository feature; it then talks to api.github.com or gitlab.com with your own access token (kept on your computer) and sends only the export.
