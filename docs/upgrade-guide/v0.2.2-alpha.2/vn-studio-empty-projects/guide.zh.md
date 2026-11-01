---
kind: upgrade-guide
description: VN Studio 移除内置示例创建功能，默认显示空白创建表单。
---

# VN Studio 项目创建

[English](guide.md) | 中文

## 变更

本地 VN Studio 安装包移除示例章节、美术、创建按钮和 `vnMedia.example` 远程方法。不带 `project` 参数打开应用时，现在显示标题和创意均为空的表单，不再自动恢复浏览器记住的项目。已保存的项目（包括先前创建的示例）保留其文件，仍可读取。

## 迁移

1. 将 `vnMedia.example` 调用替换为 `vnStudio.create` 以创建空白项目，再通过现有制作指导或编辑操作添加原创内容。
2. 使用项目选择器或带 `project` 参数的链接主动打开已保存的作品。
3. 确认应用首页的标题和创意为空，再创建项目并确认其中没有预设对白或素材。无需迁移已保存的数据。
