# Browser authoring and recovered final games

The browser stage remains the authoring preview. Configuring recoveredSystemDirectory and recoveredCompilerExecutable together activates actual recovered common-system execution. Run game compiles the saved project and launches that local engine; Export game packages a standalone Windows runtime ZIP with project title, cursor and dialogue skins. Without this paired configuration, preview returns a browser URL and does not launch an engine. Upgrade Host and UI together for the new exportGame Remote method and distinct preview receipts.

Use dev-tools/enable-vn-recovered-systems.mjs with DSH_HOME, VN_STUDIO_RECOVERED_SYSTEMS and VN_STUDIO_RECOVERED_COMPILER for validated private local templates. use-browser-player.mjs is an explicit opt-out; do not run it on startup when recovered execution is intended. Project/account data is preserved. The service source does not contain the private template, original executable or original common artwork.

Recovered compilation preserves full beat snapshots, CG/framing/focus, cue audio and native transitions. Authored boolean conditions keep original choice indices and dedicated named native properties survive local saves. The separate new-game entry resets flags. Old native compilers that ignored these fields must not be substituted silently.

Export copies the runtime into a fresh folder and ZIP with Game.exe, Start-Game.cmd and empty ordinary savedata directories. It excludes linked existing saves, authoring.json, source/skin working directories and build metadata. This configured runtime is Windows-only; browser preview remains available elsewhere. Public distribution of the service source does not include the private game runtime files.

Reference-capable custom image providers advertise supportsReferences:true. Referenced expressions/CGs remain unassigned until deliberately placed in scene or beat visuals. The optional generations-only Images API adapter reports unsupported references blocked while local audio continues. Existing dependency/license notices remain required.
