---
kind: upgrade-guide
description: VN Studio removes bundled sample creation and opens an empty creation form by default.
---

# VN Studio project creation

English | [中文](guide.zh.md)

## Change

The local VN Studio bundle removes its sample chapter, artwork, creation button and `vnMedia.example` remote method. Opening the app without a `project` URL now shows an empty title and idea form instead of restoring a browser-remembered project. Saved projects, including previously created samples, keep their files and remain readable.

## Migration

1. Replace calls to `vnMedia.example` with `vnStudio.create` for an empty project. Add original content through the existing production director or authoring operations.
2. Open saved work explicitly from the project selector or a URL with its `project` parameter.
3. Confirm the root app shows empty title and idea fields, then create a project and verify it has no predefined dialogue or media. No saved-data migration is required.
