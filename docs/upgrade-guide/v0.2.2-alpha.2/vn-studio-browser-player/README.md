# Independent browser player

VN Studio now always runs its independently implemented browser player. Native compiler/original-game configuration fields remain accepted only for profile compatibility and do not activate compilation or process spawning. Only projectDirectory is required; media jobs have a default working directory beneath it. The old original/native launch button is removed.

The vnStudio.preview Remote method and vn_project preview tool now return {revision, projectId, playback:"browser", url} rather than a native directory/processId. Clients must use the browser project link; a returned descriptor does not establish that another window opened. Existing built UI must be upgraded together with its Host declarations. The active UI uses its own player and restart control.

Apply dev-tools/use-browser-player.mjs with DSH_HOME set to an existing profile to remove retired engine/font bindings. Authoring documents, generated media, native save folders and credentials remain untouched. Browser progress/preferences use their existing separate store; original-engine native saves are not compatible browser saves.

Default production now prepares and verifies original title/cursor/dialogue art for every project, regardless of former playback configuration. Open-source application/dependency license notices remain required. Removing a commercial runtime does not convert existing third-party code into wholly original code.

The shared direction pack adds optional beat visual snapshots, boolean choice conditions/effects and generated image references. Existing authoring documents and browser slots without these fields remain readable. New flags are stored only in browser progress. Upgrade Host and UI together before authoring these additions; older players do not implement them. Existing stories are not automatically rewritten.

Custom media providers that accept image references must advertise `supportsReferences:true`; omitted capability means generation without references only. Native Codex advertises this capability. Referenced expression/CG tasks remain unassigned until deliberately placed in scene or beat visuals, rather than being appended as extra actors. The default director performs this placement workflow. The generations-only optional Images API adapter cannot edit referenced images and reports such tasks blocked while other executable media work continues.
