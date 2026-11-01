---
kind: upgrade-guide
description: VN Studio defaults to native Codex images and changes director mutation tool results to compact receipts.
---

# VN Studio image production

English | [中文](guide.zh.md)

## Change

The local bundle automatically registers `codex-images`, backed by the installed CLI's managed sign-in and native image capability. A ready native provider takes priority over the optional API connection. Writing authentication remains unchanged. Director model-tool mutations return compact receipts instead of repeating the whole project; full reads and Remote UI responses are unchanged. New plan scores accept objects or JSON strings. Existing bounded stored score strings remain readable, including undo history.

## Migration

1. Install and sign in to Codex with image generation and the imagegen skill enabled. Set `codexExecutable` on the `vn-studio` config when the CLI is not on PATH, or set `codexImageEnabled: false` to retain API-only operation.
2. Consumers of `vn_director` mutation results must read the current top-level `revision`, changed IDs and counts. Use its explicit `read` action when full project content is required. `prepare_media` also returns `status`.
3. Confirm `vn_media status` reports `codex-images` ready, then prepare planned artwork without supplying an Images API key. Required unavailable or unassigned media must remain incomplete.
