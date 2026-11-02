# Beat staging and remembered choices

Use only admitted asset ids returned by VN Studio. The illustrative ids below must be replaced with those real ids. `write_scene` replaces the complete line list; preserve existing lines when revising a beat. Scene-level visual roles omitted from a write are preserved, but a supplied line visual is a complete snapshot, not a patch. Its contents persist until the next snapshot, including across lines with no visual. An empty snapshot with `characters:[]` clears the stage. Include music again when it must continue across a new snapshot.

```json
{
  "id": "offer",
  "lines": [
    {"speaker":"", "text":"그녀가 떨어진 봉투를 집어 든다."},
    {"speaker":"하나", "text":"이름은 보지 않았어.",
     "visual":{"background":"ACTUAL_ROOM_ID","characters":[{"asset":"ACTUAL_SHY_ID","x":50,"y":100,"scale":0.85}],"shot":"close","focus":0,"transition":"dissolve","music":"ACTUAL_MUSIC_ID"}},
    {"speaker":"", "text":"봉투를 내밀던 손이 잠시 멈췄다.",
     "visual":{"cg":"ACTUAL_EVENT_CG_ID","characters":[],"transition":"dissolve","music":"ACTUAL_MUSIC_ID"}}
  ],
  "choices": [
    {"text":"같이 열어 보자고 한다","target":"open_together","effects":{"trusted_hana":true}},
    {"text":"고맙다고 하고 주머니에 넣는다","target":"keep_letter","effects":{"trusted_hana":false}}
  ]
}
```

Create both target scenes before saving these choices. Give each action its own immediate response, then rejoin if appropriate. A later scene can expose different continuation choices using `when:{"trusted_hana":true}` and `when:{"trusted_hana":false}`. Every key in a `when` map must match; a flag never set is false. `effects` only assigns booleans. Keys match `[a-z][a-z0-9_-]{0,63}`, at most 64 per authored map. The player preserves accumulated flags in manual/quick saves and clears them on a fresh start. No numeric relationship evaluator or arbitrary code is supported. History is a reading log, not rollback.

## Image workflow

1. Plan and generate distinct base cast portraits and location backgrounds. Call `prepare_media`, continue bounded batches, and retain the returned real `assetId` values.
2. Preserve the production bible and add expression/pose or event CG tasks with `referenceAssetIds:["RETURNED_BASE_CHARACTER_ID"]` (up to three admitted image ids). Specify identity, unchanged costume/style, precise eyes/mouth/body action, composition and emotional purpose. An event CG uses kind `background`; a transparent sprite variant uses `character`.
3. Generate the variants with the ready `codex-images` provider. The optional generations-only Images API adapter rejects reference requests explicitly; report this limitation instead of silently generating inconsistent replacements.
4. Assign the returned variant ids in line snapshots. `prepare_media` preserves occupied scene roles, so use `write_scene` to place expressions and CGs at the intended beat. A task's `sceneIds` names scenes where the asset must actually appear, not every mention of its character. `status` recognizes scene and line placements.

## Directing the scene

Use the script's emotional or physical changes to motivate staging. Let a question, an avoided gaze or an interrupted action cause an expression change; let a reveal motivate a closer shot. Reserve dedicated CGs for compositions ordinary sprites cannot convey, such as handing over an object or catching someone. Use wide shots to establish space, medium for conversation, close for a chosen reaction; focus is an actor slot in the current snapshot. Return from a CG by providing a new snapshot with the room and actors. Dissolve or cut describes a visual cue change, not actor animation. Reduced-motion preferences disable transition motion.

Do not change pictures every fixed number of lines. Do not count total beats or successful imports as artistic completion. Preview important reactions, each reachable choice and later consequences, save/load at a branch, and verify the image actually changes. Keep distinct character voices and enough action/reaction for the stakes to develop. Adapt the workflow to comedy, mystery, romance or the creator's requested genre without inserting a default setting.
