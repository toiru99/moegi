# 视觉小说工作室

首页的标题和故事创意均为空。可以请已连接的AI创作，也可以创建空白项目手动编辑，或主动选择已保存的作品。只有带 `project` 参数的链接会直接打开项目，浏览器记住的选择不再自动恢复。安装包不附带示例故事或美术；既有项目及其素材仍可读取。

图片默认通过已登录的本地Codex CLI及其公开stdio app-server协议生成，使用Codex套餐，无需Images API密钥。`codexImageEnabled`默认为true，`codexExecutable`默认为`codex`，`codexImageTimeoutMs`默认为300000。提供者管理独立的临时只读任务、取消与进程清理，只接收已完成的原生PNG，人物图片要求实际透明。可选Images API连接独立使用其API额度。缺少API密钥不会阻止已就绪的Codex提供者；必需素材未完成时，制作状态仍为未完成。制作指导的修改工具返回修订号、变更ID和数量等精简回执，显式读取及Remote UI仍返回完整项目。计划乐谱接受对象或JSON字符串，验证后保存为字符串。

VN Studio保存带修订号的小说文档、注册 `vn_project` 工具，并使用真正的siglus_rs引擎预览。结构化编辑器位于现有右侧栏。此包用于本地开发，设置中提供独立的ChatGPT连接页，与编辑器共享登录状态。

为 `vn-studio` 配置 `projectDirectory`、`previewDirectory`、`compilerDirectory` 和 `fontFile` 后启用。安装时默认禁用，避免自动选择目录或运行引擎。编译目录需要 Windows 版 `siglus_script_compiler.exe`、`siglus_scene_linker.exe` 和 `siglus_engine.exe`。预览用文件名选择提供的字体并复制到快照中。本地开发使用完整的Noto Sans CJK KR Regular；Noto Sans KR子集和Malgun Gothic缺少部分日文汉字。字体来源与许可：[Noto Sans CJK](https://github.com/notofonts/noto-cjk/blob/main/Sans/README.md)、[OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE)。

编辑器支持创建和打开项目、编辑对白和选项、保存、重新加载、撤销保存以及在 Siglus 中运行。未保存的修改会禁用替换当前草稿的操作。智能体通过同一个 `vn_project` 工具访问相同场景图；保存前读取，智能体编辑后重新加载。选项目标必须存在，保存与撤销需要当前修订号。一个 Host 顺序执行写操作，在2 MiB文件上限内最多保留五个历史版本；不要让多个 Host 写入相同目录。

## Model Experience

插件提供一个 `vn_project` 工具，返回项目数据和修订号的 JSON 文本。读取或保存会将整个场景图加入对话，因此文档与历史大小受到限制。插件不额外调用模型，也不改变缓存策略。ChatGPT登录和Responses传输由现有 `llm-pi-ai` 提供者负责；配置 `openai-codex` 路由后，在编辑器或设置中点击ChatGPT登录按钮，启动浏览器PKCE流程。弹窗被阻止时仍可手动打开链接。凭据保存在现有Host凭据存储中。

## Known Limitations and Deferred Work

当前只支持文字、话者与场景选项，不导入完整商业脚本，不复制原作素材，也不开放全部 Siglus 渲染命令。预览使用未压缩 easy-link 格式。文件写入只在同一个 Host 内串行化，原生渲染、字体和存档由引擎管理。当前 Windows 工具链尚不提供跨平台分发流程。
