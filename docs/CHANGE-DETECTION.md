# Detecting changes since last time: what can be stored, where, and who can see it

Goal: when you open a file you edited before, the plugin shows what changed (added / renamed / removed / drawing / colour…) without asking you to load a file.
That needs a **baseline snapshot**: per icon `componentKey, name, geometry hash, colour hash, layer name, category` (~90 bytes each; 700 icons ≈ 60 KB raw, ≈ 15 KB deflated with the `fflate` we already ship).

## Storage options

| Where | Who can read it | Survives | Limits / caveats | Writes to the Figma file? |
|---|---|---|---|---|
| **`figma.clientStorage`** | Only **you, on this machine/app profile**. Not synced to other devices or users. Also readable in your own Dev Mode sessions. | Plugin restarts, file closes. Lost if cache/app data is cleared or the plugin id changes. | 5 MB total per plugin ([docs](https://developers.figma.com/docs/plugins/api/figma-clientStorage), [limit raised from 1 MB](https://developers.figma.com/docs/plugins/updates/2025/03/17/version-1-update-109/)). No built-in file identity (see below). | No |
| **`root.setPluginData`** (private to our plugin id) | **Everyone with access to the file** who runs this plugin, including developers in Dev Mode (read). | Sessions, users, file history. Copies of the file *probably* carry it (verify). | 100 kB per entry ([docs](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata)); chunk across keys. Needs **edit access to write**. A [report](https://forum.figma.com/t/the-data-saving-with-figma-root-setplugindata-in-a-branch-will-not-be-merged-into-main-branch/53002) says data written on the **root in a branch was not merged**; the same report says page-level data merged. Offline edits can [overwrite entries](https://forum.figma.com/t/changes-of-plugin-data-get-lost-after-offline-data-integration/51867.rss). | **Yes** (one small write; opt-in) |
| `page.setPluginData` | Same as root | Same, and merges better in branches (per the report) | Lost if the page is deleted | Yes |
| `setSharedPluginData` | **Any plugin** knowing the namespace/key | Same as plugin data | 100 kB; not private | Yes |
| **Repo `icons.json`** (via the Project sync companion) | The whole team, in git (GitHub/GitLab) | Forever; reflects what developers actually **ship** | Needs the companion running | No |
| Figma REST API (outside the plugin) | Anyone with a token | Version history, component `updated_at` | Needs network + token (companion/CI only; the plugin has no network) | No |
| `documentchange` events | Only while the plugin window is open | Session only | Fine for "changed since I opened the plugin" | No |

## Same user vs everyone
- **Only you / this machine:** `clientStorage`. Good default: free, silent, no file writes. Two designers have different baselines; a new laptop has none.
- **Everyone who opens the file:** in-file plugin data and the repo. These make a baseline *shared*: designer, DS engineer and developer see the same "changed since v1.3.0".
- **Never rely on in-file data alone** for something that must not be lost: branches, offline edits and duplicated files can drop or fork it. Keep the repo copy (or at least the last `icons.json`) as the durable record.

## File identity (so a local snapshot belongs to the right file)
1. `figma.fileKey`: **private/org plugins only**, needs `enablePrivatePluginApi`; public plugins cannot get it ([forum](https://forum.figma.com/t/why-is-the-figma-filekey-showing-as-undefined/36201)), and org-published plugins have reported `undefined`.
2. A random id written once into the file's plugin data (needs a write).
3. Fallback: hash of file name + page ids (fragile: duplicates and renames confuse it).
A duplicated file copies in-file data (likely) with the same id; compare ids to detect "this is a copy".

## Recommended design (layered baseline)
1. **Repo** `icons.json` if the companion is connected (what developers have).
2. **Shared in-file snapshot** (opt-in, Labs; one write per export on a page node, chunked + deflated, with `snapshotId`, timestamp, author, library version).
3. **Local snapshot** (always, automatic).
4. Manual file load (exists today).

UI: a "Changed since ▾" selector on the scan result (baseline name + date + who), and filter chips on the icon list (new / renamed / drawing / colour / moved).
Dev Mode reads (1) or (2) to say "this icon changed in v1.3.0".

## Decisions needed
- Allow the opt-in in-file write (one small data entry, visible in version history)? Page-level or root?
- Do you run an org/private plugin (then `fileKey` is available) or a community plugin?
