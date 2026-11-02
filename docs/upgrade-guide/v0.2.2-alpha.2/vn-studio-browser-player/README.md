# Independent browser player

VN Studio now always runs its independently implemented browser player. Native compiler/original-game configuration fields remain accepted only for profile compatibility and do not activate compilation or process spawning. Only projectDirectory is required; media jobs have a default working directory beneath it. The old original/native launch button is removed.

The vnStudio.preview Remote method and vn_project preview tool now return {revision, projectId, playback:"browser", url} rather than a native directory/processId. Clients must use the browser project link; a returned descriptor does not establish that another window opened. Existing built UI must be upgraded together with its Host declarations. The active UI uses its own player and restart control.

Apply dev-tools/use-browser-player.mjs with DSH_HOME set to an existing profile to remove retired engine/font bindings. Authoring documents, generated media, native save folders and credentials remain untouched. Browser progress/preferences use their existing separate store; original-engine native saves are not compatible browser saves.

Default production now prepares and verifies original title/cursor/dialogue art for every project, regardless of former playback configuration. Open-source application/dependency license notices remain required. Removing a commercial runtime does not convert existing third-party code into wholly original code.
