# VN direction pack implementation plan

**Goal:** Make the shared director produce visible reactions and real choice consequences, supported by the independent player rather than instructions alone.

**Architecture:** Add backward-compatible full visual snapshots to individual dialogue beats. Effective scene visuals are the last snapshot at/before current line, otherwise scene.visual. Extend visual state with shot wide/medium/close, transition cut/dissolve, focus slot, and CG image reference. Add bounded boolean choice effects/when, persist flags in gameplay slots. No arbitrary scripts. Native Codex image tasks accept up to3 admitted existing image references for consistent expressions/CG.

**Tech stack:** Existing TypeScript/Cordis/React browser player, project parser/store, Codex media provider, default vn-director skill.

- [ ] Model/parser/tool support: line.visual full SceneVisual snapshots; visual shot/transition/focus/cg; choice effects/when boolean maps; ProductionMedia.referenceAssetIds.
- [ ] Deterministic playback: last visual snapshot, conditional choice filtering, boolean effects, flags saved/loaded/reset. Existing docs and slots remain readable.
- [ ] Render expression/image changes, framing/focus, CG and dissolve; use effective visual media/urls/audio per beat.
- [ ] Native image generation forwards admitted reference images for portrait variants and CG; planned tasks use references.
- [ ] Default shared direction skill plans emotional beats, immediate/delayed choice feedback, required variants/CG and checks; no unsupported Live2D/minigame promises or mandatory quotas.
- [ ] Meaningful model/runtime/media tests, type/build, installed v16, isolated interactive scene with distinct choices/visuals/flags/save-load. Preserve user's97beats and13assets.
- [ ] Publish same codex/local-vn-studio branch; main untouched. Record research scope and supported limits.

Wire additions: lines[].visual?:SceneVisual; SceneVisual shot?:'wide'|'medium'|'close', transition?:'cut'|'dissolve', focus?:number (0..2), cg?:string(background image asset); choices[].when?/effects?:Record<string,boolean>. Boolean maps max64 identifier keys; unspecified flag readsfalse. PlaybackState/GameSave flags?:Record<string,boolean>. Media task referenceAssetIds?:string[] (max3 existing admitted images).
