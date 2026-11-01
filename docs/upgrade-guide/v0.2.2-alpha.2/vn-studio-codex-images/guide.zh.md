---
kind: upgrade-guide
description: VN Studio 默认使用原生Codex图片，并将制作指导修改工具的结果改为精简回执。
---

# VN Studio 图片制作

[English](guide.md) | 中文

## 变更

本地安装包自动注册 `codex-images`，使用已安装CLI管理的登录和原生图片能力。就绪的原生提供者优先于可选API连接，写作认证保持原样。制作指导的模型修改工具返回精简回执，不再重复整个项目；完整读取和Remote UI响应不变。新计划乐谱接受对象或JSON字符串，既有有界字符串（包括撤销历史）仍可读取。

## 迁移

1. 安装并登录Codex，启用图片生成和imagegen技能。CLI不在PATH中时，在 `vn-studio` 配置中指定 `codexExecutable`；若只使用API，可设置 `codexImageEnabled: false`。
2. 解析 `vn_director` 修改结果时，读取顶层当前 `revision`、变更ID及数量。需要完整项目时显式调用 `read`，`prepare_media` 还会返回 `status`。
3. 确认 `vn_media status` 中的 `codex-images` 已就绪，然后无需Images API密钥即可准备计划美术。不可用或未配置到场景的必需素材仍应视为未完成。
