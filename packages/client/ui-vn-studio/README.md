# VN Studio

VN Studio is a local AI-assisted visual novel authoring tool. The active player is independently implemented in React/Web APIs and reads authored project JSON and admitted project media. It does not compile recovered commercial scripts, load original game UI resources, or launch an original game executable. Previous native compiler modules remain historical research utilities, not the active application playback path.

The editor always supplies its own stage, choices, title, save/load, history, auto/skip, audio and settings. Game progress is stored separately from authored projects. Restart never discards unsaved story edits. Existing native saves are retained on disk but are not imported into browser progress. Generated project title/dialogue/cursor images skin the independent player; the assistant shares the project's title artwork and actual production counts.

Configure projectDirectory; previewDirectory and former native compiler/font fields are legacy-compatible optional settings. dev-tools/use-browser-player.mjs removes retired native bindings from an existing managed profile while preserving projects and account settings. Preview returns an honest browser project URL/descriptor and never creates a native process. No original commercial-game installation is required for active browser gameplay.

## Model Experience

The default-on vn-director plugin and packaged skill plan cast, relationships, scene pacing and real media tasks, then write complete scenes. It prefers signed-in native Codex images and composes actual local WAV music/effects. prepare_media also prepares original title/logo, transparent cursor and dialogue-frame artwork in every playback configuration. Readiness checks actual admitted files, placements, scene reachability and production pacing. Existing assets, dialogue, choices and visual staging are preserved. Required unfinished media keeps production incomplete.

ChatGPT writing uses the existing account/Responses integration; image generation uses the public installed Codex app-server with managed sign-in. The app does not extract or publish credentials. An optional Images API key remains separate. Commands use current revisions, bounded jobs and cancellation. Agent mutation receipts are compact; explicit reads and UI methods return full authoring data.

## Direction pack (vn.16)

The default director now plans emotional turns, referenced expression/pose variants, event CGs, and choices with immediate and later feedback. It applies automatically to new chapters and requested revisions. Existing chapters are preserved until requested for revision. Detailed authoring examples ship in `assets/skills/vn-director/references/direction.md` beside the default skill.

Each `lines[].visual` is a complete visual snapshot retained until the next cue; absent snapshots inherit the previous cue or scene visual. Supported direction fields are `shot` (`wide`, `medium`, `close`), `focus` (current portrait slot), `transition` (`cut`, `dissolve`) and `cg` (admitted background image id, replacing ordinary background/portraits). Include intended persistent music in each new full snapshot. The player respects reduced motion. No Live2D or arbitrary animation timeline is implied.

Choices support bounded boolean `when` and `effects` maps. All conditions must match; unset flags read false. Effects survive manual and quick saves, clear on a new start, and never mutate authored stories. Existing documents and save slots without these additions remain readable. This is boolean story memory, not a numeric relationship simulation or history rollback.

Image tasks accept up to three admitted `referenceAssetIds`. Generate base portraits first, then use their returned ids to generate variants or event CGs through native Codex. References are integrity-checked project images and forwarded as native local-image inputs. The optional generations-only Images API adapter explicitly rejects reference editing requests rather than discarding them. Assign variants in beat snapshots; readiness recognizes both scene and beat image placements.

## Limits and licensing

Browser gameplay is the Windows/macOS-independent execution path; this change is verified on Windows, not an actual Mac. Each scene supports up to three visible portraits. Supplied game stories and all previously generated project assets remain user's data. Existing open-source dependencies retain their licenses; independent gameplay does not make the entire upstream application proprietary or wholly original. Historical recovered-runtime research does not grant commercial distribution rights to original commercial scripts, executable files or media.
