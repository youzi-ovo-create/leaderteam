# Changelog

本项目的所有重要版本变更均记录于此文件，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [2.6.2] (`windows-v2.6.2`) - 2026-11-28

**Windows `x64` 安装链路缺陷修复维护版**（针对 `v2.6.1` 首次人工零 AI 验收暴露的 PowerShell 入口与 NTFS Junction 安装故障专项修复，不覆盖既有 `windows-v2.6.1` 制品）：

### Fixed
- **PowerShell 公开一键命令 `AmpersandNotAllowed` 根治**：移除 `install-leaderteam.ps1` 首部 UTF-8 BOM（避免 Windows PowerShell 5.1 `irm | iex` 将首行 `\uFEFF#` 当命令解析触发 `&` 语法错误）；改用 `& { ... } @args` + `return` 避免关闭交互终端；强制 TLS 1.2+ 兼容并采用临时文件原子更新下载器脚本。
- **跨盘符 NTFS Junction `.dsh` 安装/升级/回滚修复**：在统一下载器、核心安装器与内置自动更新器中，当 `%LOCALAPPDATA%\pnpm\store` 为失效目录联接时，优先读取并尊重目标 profile `node_modules/.modules.yaml` 已绑定的健康 `storeDir`（经 `realpathSync.native` 归一化），消除 `ERR_PNPM_UNEXPECTED_STORE`；遇到目录迁移或旧 store 失效导致的 `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE` / `STORE` 冲突时，自动仅对 `node_modules` 做原子备份重建（失败自动还原，零改动已有配置、凭据、会话与团队历史）。
- **错误精准分类与一键安全关闭内联入口**：修复 `dsh plugin add` 报错丢弃 `stdout` 且因命令行含 `DeepSeek Harness.exe` 被误报为「DSH 正在运行或目录被占用」的缺陷；严格区分运行中进程（`DESKTOP_CLIENT_RUNNING`，错误框内联「一键安全关闭 DSH 并重试安装」按钮）、pnpm 仓库路径冲突、文件锁（`EBUSY`）与权限异常（`EPERM`/`EACCES`），并展示失败操作、涉及路径及可展开完整诊断详情。

### Verification (`windows-v2.6.2`)
- 主包全量单测 **460 通过、0 失败、3 跳过**；真实克隆跨盘符 NTFS Junction（`v2.3.1` + 失效 `%LOCALAPPDATA%\pnpm\store` + `D:\Apps\DeepSeek-Harness`）零 mock 连续通过 `2.3.1 → 2.6.2` 安装、`2.6.2 → 2.6.1` 回滚、`2.6.1 → 2.6.2` 升级、`2.6.2` 修复安装且配置/会话/团队历史 100% 完整保留；独立干净配置复测 `Run-Windows-Retest.ps1` 退出码 `0`（19 次本地模拟调用）；真实 GitHub Raw 地址在 Windows PowerShell 5.1 下直接实测通过。

## [2.6.1] (`windows-v2.6.1`) - 2026-11-28

**Windows `x64` V2.6 稳定维护线首轮易用性与接入体验升级**（完整继承 `windows-v2.6.0` 稳定性修复，聚焦统一跨线安装器、常用供应商预设与 Magpie 本机自动发现一键接入，不削弱任何自定义与治理能力）：

### Added
- **统一跨线下载安装器（LT / OLT × Windows / Linux 四线合一）**：
  - 新增 Windows 一行 PowerShell 安装脚本 `install-leaderteam.ps1`（`irm https://raw.githubusercontent.com/youzi-ovo-create/dsh-leaderteam-releases/main/install-leaderteam.ps1 | iex`），升级 `Install-LeaderTeam.cmd` 支持单文件下载双击自举，升级 `install-leaderteam.sh` 支持 `curl -fsSL ... | bash` 管道直跑；
  - 统一下载器 `lt-installer-standalone.mjs` 支持选择产品线（LT 闭源免费版 / OLT 开源维护版）、实时拉取当前系统适配的 GitHub Releases 版本列表、首次安装与修复安装（保留全部本地配置与历史数据）、缺失 DSH 时的官方下载引导、一键安全关闭运行中 DSH 客户端，以及旧版 LT / OLT 轨道识别与跨线切换强制确认守卫；产品内自动更新机制保持原样复用。
- **常用供应商预设 + 全量自定义保留**：工作台「接入 → 供应商与 Key」抽屉新增 DeepSeek 官方、阿里云百炼 (DashScope)、智谱 BigModel (GLM)、OpenAI 官方、Anthropic 官方、Google Gemini、OpenRouter、远程 Magpie 等常用预设快填与自动发现入池选项，100% 保留自定义供应商 ID、4 种协议、Base URL、多 Key 与 7 角色备用链配置能力。
- **Magpie 本机自动发现与一键接入**：新增本机回环端口安全探测（严格限 `127.0.0.1` / `localhost`，自动过滤 LT 内置轻量网关），发现本机 Magpie 后支持一键直连 DSH 原生通道（保留 `/quota` 并自动配齐角色）或经 LT 内置网关托管，同时保留手动接入远程 Magpie 及其他兼容网关入口与原 `Magpie 外部网关` 卡片编辑/刷新按钮。

### Fixed
- 修复安装器与内置自动更新器在发布资产同时包含独立衡账包 `lt-usage-plugin-*.tgz` 时仅按 `.tgz` 后缀匹配可能误选辅助包的问题，改为严格按当前平台匹配 `dsh-leaderteam-*.tgz` 主插件包。

### Verification (`windows-v2.6.1`)
- 主包全量单测 **456 通过、0 失败、3 跳过**；独立干净配置复测 `Run-Windows-Retest.ps1` 退出码 `0`（`installedVersion: "2.6.1"`，`sha256VerifiedAgainstSums: true`，19 次本地零费用模拟调用）；真机浏览器交互验收通过（统一下载器四线版本切换 + `/lt` 供应商预设与自定义编辑 + 本机模拟 Magpie 自动发现与一键接入，0 console/page error）；`rust/mapper/src` 零改动。

## [2.6.0] (`linux-v2.6.0`) - 2026-11-27

**Linux `x86_64` 长期维护稳定线首版**（基于 `linux-v2.5.1` 河洛序三层 UI 与会话内 Single / Team 双模式基线，合入宿主兼容、会话级配置同步与全量回归稳定性修复，闭源免费公开发行，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）：

### Added & Converged
- **宿主兼容、安装更新与会话级配置同步（Issues #1–#4）**：支持 DeepSeek Harness `>=0.2.2-alpha.2 <1.0.0` 结构契约自适应校验，集成零命令行安装器与分轨热更新/回滚能力，支持会话级隔离配置自动同步、空闲边界改绑领队/执行者即时生效及 `follow` / `enforce` 策略守护。
- **衡账会话日志与统计增强**：新增对未压缩 `session.v4.jsonl` 会话日志的原生读取支持，补齐衡账三源物理计数 `sourceCounts` 与 `1d / 7d / 30d` 自然日时间窗。

### Fixed & Hardened
- **9 项 V2.5.1 冻结后通用修复与多轮探索问题闭环（L1–L7 / C1–C3）**：加固双 DSH Web 网关启动锁与停机归属保护、OpenAI Responses/Gemini 非正常停止原因映射、前端会话快切防串账、改价抽屉保留错峰单价、`micro-react.js` `defaultValue` DOM 同步、弹性并发上限 `maxActiveMembers=6`、备用凭据切换按服务商汇总、43+ 模型全量探测分页及高并发跨进程配置写锁保护。
- **新增模型入池状态与回滚一致（`REG-01`）**：修复新增模型选择「暂不入池」时误报错并产生半写入状态的问题，同步异常时自动回滚网关模型快照。
- **失败尝试用量与未定价费用全链路一致（`REG-02`）**：修复失败重试用量统计与未定价请求在明细、会话总计、说明文案与公共账单接口间的口径分歧，确保无价格表或缺失 usage 时统一保持费用未知（`unknown != 0`）。
- **热回滚完整性与配置兼容性预检（`REG-03` / `REG-04`）**：备份记录全量文件 SHA-256 清单与工作台核心脚本结构校验；回滚前在独立子进程验证备份包对当前实时配置（含合法 `follow` 策略）的兼容性，校验失败前不卸载当前运行包；紧急恢复前先清理损坏包并支持 CLI 回退恢复。
- **多端点探测竞态防护与四协议实调严校验（`REG-05` / `REG-08`）**：按目标 `baseUrl` / `protocol` / `endpointUpdatedAt` 校验在途探测回执，阻断旧慢端点回执将未收到请求的新端点误标为已验证；四协议实调校验拒绝空壳、排队中、无有效输出及回显体，同时保留合法的非文本工具调用与推理回执。
- **跨窗口并发改价字段合并与衡账明细时间窗联动（`REG-06` / `REG-07`）**：同一路由在不同标签页分别修改不同单价字段时按触碰字段合并保留不互相覆盖；衡账会话明细随 `1d / 7d / 30d` 时间窗同步透传 `sinceMs`，与总览保持一致。
- **跨架构更新过滤与缓存隔离（`REG-09` / `RISK-01`）**：更新器同时校验操作系统与 CPU 架构（`x64` 不推荐仅含 `arm64` 制品的版本），并按发行轨道、预发布开关及平台架构隔离检查缓存。
- **发行包法律声明与元信息对齐（`REG-10`）**：包内 `LICENSE`、`THIRD_PARTY_LICENSES`、`leaderteam/NOTICE` 与 `package.json` 许可/反馈链接同公开制品仓逐字节对齐。

### Verification (`linux-v2.6.0`)
- Ubuntu 24.04 `x86_64` + Node.js v24 + DeepSeek Harness `0.2.2-rc.5`（CLI / Web）：Rust `lt-mapper` `17/17`（Clippy 零警告）、JS 单测 `423/423`、独立衡账 `24/24`、公共契约 `6/6 + 3/3`、真实 DSH 全量串行集成 `52/52`、独立计费回放复测 `0` 问题、干净离线重打包与 `lt-doctor` `5/5` 全部通过。

## [2.6.0] (`windows-v2.6.0`) - 2026-11-27

**Windows `x64` 长期维护稳定线首版**（缺陷披露与稳定性修复专版，含独立衡账 `lt-usage-plugin-windows-v2.6.0.tgz`、独立复测包与完整《[V2.3–V2.6 缺陷披露与稳定性修复报告](docs/V2.3-V2.6缺陷披露与修复报告.md)》；Context Core 留给 `v2.7`）：

### Fixed & Hardened
- **上游静默挂死与 `0-tool` 备用回退（`ARCH-01`）**：网关拆分 120 秒首有效事件期限与 90 秒流中空闲期限（心跳注释不续期），首事件前支持同渠道备用 Key 切换，并将 `TTFT_TIMEOUT`/流中断映射为 `unavailable` 联动备用模型；官方宿主 `0.2.2-rc.1` 实测 `it53`（120.006s / 0 工具触发备用写入）与 `it54`（先读写后 120.015s 静默停机、备用 0 请求）全部通过。
- **收尾按需工具与读图授权（`ARCH-02`）**：收尾提示按阶段验收要求选择浏览器/读图工具，`direct_exec` 按需获读图能力，减少非 GUI 工程收尾时的无效探测。
- **网关热路径配置缓存与 Windows 冷启动超时放宽（`ARCH-03`）**：网关复用未变更的供应商配置并在文件替换时自动重读；Windows 网关子进程冷启动等待超时由 `8s` 放宽至 `15s`（启动锁 `18s`）。
- **衡账超长推理归属与独立包同步（`ARCH-04`）**：结合实测耗时匹配超长推理唯一候选并按会话区分重复响应 ID（12 分钟样例与跨网关三轮去重 `1,740` tokens 通过）；主插件与独立衡账 `report.js` 逐字节对齐（29/29 通过）。
- **工作台首访引导、1400px 布局、跨标签同步与宿主系统行（`ARCH-05`）**：首访自动弹出引导并持久化关闭，1400px 左栏展开顶栏按钮留白 `12px`，模式与模型变更跨标签同步，宿主时间采样与模型切换折叠为独立系统提示行（Chrome 七项实测通过）。
- **打包权限与独立复测包**：Windows 打包器标准化 `install-leaderteam.sh` 及可执行脚本为 `0755`，并随 Release 附带 `windows-v2.6.0-verification.zip`。

### Known Open Items (`v2.6.x`)
- 仍开放三项架构工作（宿主请求头历史成员目录回退扫描与多文件模型配置收敛、未随主包发行的旧扩展衡账副本、内嵌面板与 `/lt` 三套 HTTP 接口），及完整 Linux Web 宿主验收（将由 Linux 侧独立完成后发布 `linux-v2.6.0`），详见 [V2.3–V2.6 缺陷披露与稳定性修复报告](docs/V2.3-V2.6缺陷披露与修复报告.md)。

## [2.5.1] (`windows-v2.5.1`) - 2026-11-27

**Windows `x64` 独立发行版**（会话内 Single / Team 无损双模协作 + 河洛序三层工作台 UI + 独立衡账 `lt-usage-plugin-windows-v2.5.1.tgz` + 全套 Windows 真机适配，闭源免费公开发行）：

### Added
- **河洛序三层工作台与会话内 Single / Team 双模式**：完整支持 `/lt` 河洛序工作台与 DSH 侧栏双模热切换（含 7 重安全锁守卫、纯 Single 零 `teams/` 磁盘开销）、四步模型接入向导、私有映射工作台及衡账三源对账；随附 Windows 适配版独立衡账包 `lt-usage-plugin-windows-v2.5.1.tgz`。
- **零命令行图形化安装器与双平台分轨自动更新**：提供 `Install-LeaderTeam.cmd` + `lt-installer-standalone.mjs`（自动识别自定义安装路径如 `D:\Apps\DeepSeek-Harness`、复用官方桌面端内置 Electron 运行时、自动清理遗留补丁），原生过滤 `windows-v*` / `linux-v*` 发行标签防止跨平台误装。
- **双 ABI 预编译原生映射模块**：内置同时通过 Node.js v24 (ABI 137) 与官方桌面端 Electron 44.7 (ABI 149) 实测的 `mapper.win32-x64.node`，并完整保留经验证的 `mapper.linux-x64.node`。

### Fixed (Windows Platform, Security & UI Hardening)
- **Windows `pwsh` 词法与沙盒边界加固**：新增 `pwsh` 词法方言保留 `\` 路径分隔符并解码反引号（`` ` ``）混淆，阻断 `..\` 越界、反引号转义命令、越界 `workdir` 及工作区内 NTFS Junction 逃逸；跨字面路径与 Junction 物理路径拦截凭据（`vault.json`/`.credentials.yaml`/`.env`）与受管配置越权读写。
- **NTFS 目录联接、原生 DLL 影子加载与中文路径热升级**：网关与衡账全面经 `realpathSync.native` 归一化消除 `~/.dsh` Junction 双实例冲突；`mapper.mjs` 通过内容寻址影子副本加载消除 Windows `LoadLibraryW` 升级锁；更新器在悬空 `%LOCALAPPDATA%\pnpm\store` 联接下统一回退至 `<DSH_HOME>/leaderteam/pnpm-home`，精准核验成员在途状态并无壳直调官方桌面端 Electron CLI 保护中文路径；修复 `autoAdoptHost` 重复路由推入与 Node 24 截断 Zstd 帧校验。
- **`/lt` 河洛工作台展示修正**：修复 `/lt` 对话流中直接承载 `ev.data.content` 的用户消息被渲染为 `(空消息)` 的问题（并过滤内部 `runtime-context` 快照）；修复空闲态通过「本会话配置」切换模型后 `/lt` 输入区底部模型胶囊未随本会话配置实时刷新的问题。

## [2.5.0] (`windows-v2.5.0`) - 2026-11-27

**Windows `x64` 独立发行版**（会话内 Single / Team 无损双模协作首版 · 保留经典 `lt-v24-*` 多标签工作台 UI，闭源免费公开发行）：

### Added & Fixed
- **会话内 Single / Team 无损切换**：支持同一会话空闲边界在 `Team` 与 `Single` 模式间零重建往返切换，纯 `Single` 会话零 `teams/` 目录开销；完整合入 Issues #1–#4、`autoAdoptHost` 去重、Windows `pwsh` 安全门、NTFS Junction 归一化、原生 DLL 影子加载、一键安装器及经真机实测的 `2.5.0 → 2.5.1 → 2.5.0` 无损升级/回滚链路。

## [2.4.0] (`windows-v2.4.0`) - 2026-11-27

**Windows `x64` 独立发行版**（纯 Team 自治协作产品化首版 · 严格保持 `0` 处 V2.5 双模词汇，闭源免费公开发行）：

### Added & Fixed
- **内置轻量 API Key 网关 + 原生工作台 `/lt` + 私有 Mapper Studio + 衡账三源对账**：完整合入 Issues #1–#4、Windows `pwsh` 安全门、NTFS Junction 归一化、原生 DLL 影子加载、一键安装器、纯 Team `/api/lt-v24/sessions` 默认预设修复，以及经真机实测的 `2.4.0 → 2.5.0 → 2.4.0` 无损升级/回滚链路。

## [2.5.1] (`linux-v2.5.1`) - 2026-11-27

**Linux `x86_64` 独立发行版**（会话内 Single / Team 双模式 + 河洛序三层 UI 重构冻结终验版，闭源免费公开发行，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）：

### Added
- **会话内 Single / Team 双模式（包含全部 V2.5.0 r2 能力）**：
  - 同一会话支持在 **Single（轻量化单模型直跑）** 与 **Team（多模型分权自治治理）** 之间安全往返切换，无需重建会话或迁移上下文；
  - 引入 7 重状态切换守卫（执行中/在途成员锁定 `MODE_SWITCH_LOCKED`、空闲边界放行、持久化模式记录与切换历史审计），并在 Single 模式下保持安全门零误拦与独立计量隔离；
  - 完整对齐 `lt.public.v1` 双模式控制接口，并在 DSH 头部与空白页胶囊及 `/lt` 工作台同步展示与切换当前会话模式。
- **河洛序三层 UI 重构（V2.5.1）**：
  - 全面重构 `/lt` 独立工作台、DSH 侧边栏控制面板与衡账观测界面的信息层级与视觉排版，保留纯白默认底色、玄墨暗色、河洛序原色及自定义主题；
  - 强化模式胶囊异步预设加载稳定性、空状态引导与同会话 DSH ⇄ LT 无损快切体验。

### Fixed & Hardened
- 修复全新 profile 首次添加供应商并自动同步至 DSH `0.2.2-rc.5` 设置（含 Qwen / DeepSeek 等通道）及冷重启同步凭据/端口的问题；
- 修复同工作目录已存在会话创建时被误复用覆写预设的问题（在调用创建前显式拒绝 `SESSION_ALREADY_EXISTS`）；
- 修复跨协议流式错误账本与验证状态落盘时序、多宿主成员存活保护及多 React 渲染槽位 Hook 稳定性问题。

### Known Limitations (`linux-v2.5.1`)
- 本次发行包仅覆盖 **`Linux x86_64`（`glibc >= 2.39`）** 与 DeepSeek Harness **`0.2.2-rc.5`**（CLI / Web）；Windows x64 用户请继续使用双平台 `v2.3.0` 直至 Windows 独立发行线发布；
- 衡账默认读取 DSH `session.v4.jsonl.zstd` 压缩会话日志；
- 若干后续探索发现的边缘缺陷（失败尝试用量统计、多标签并发改价覆盖、衡账跨日日期筛选窗口、手动实调严校验及 40 模型批量探测分页等）已纳入下一版 V2.6 维护线修复，不影响 V2.5.1 核心双模式与河洛序工作台主路径使用。

## [2.5.0] (`linux-v2.5.0`) - 2026-11-27

**Linux `x86_64` 独立发行版**（会话内 Single / Team 双模式二轮终验冻结基线 `v2.5.0-linux-final-r2`，闭源免费公开发行，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）：

### Added
- **会话内 Single / Team 双模式无损往返切换**：在同一会话内支持于轻量单兵直跑（`Single`）与多角色分权自治团队（`Team`）之间切换，无需重建会话或搬移上下文；
- **7 重状态切换守卫与模式隔离**：在途执行成员存在时自动锁定（`MODE_SWITCH_LOCKED`），空闲边界即时放行并落盘切换审计日志；Single 模式下保持安全门零误拦与独立计量隔离；
- **公共契约与前端联动**：对齐 `lt.public.v1` 双模式控制接口，在 DSH 头部/空白页与 `/lt` 工作台同步展示与切换当前模式。

### Fixed & Hardened
- 完整闭环二轮深审全部 8 项缺陷与 2 项二阶对抗问题（`R2-NEW-01` 同工作目录已存在会话防 `reuseLive` 覆写预设返回 `SESSION_ALREADY_EXISTS`、`R2-NEW-02` 跨协议流式错误账本与 `probe_failed` 在 `res.end` 前同步落盘），以及 React `#311` 异步预设加载 Hook 稳定性修复；
- 通过 Rust `lt-mapper` `17/17`、JS 单测 `402/402`、独立衡账 `24/24`、双线契约与真实 DSH `0.2.2-rc.5` `52/52` 全场景验收。

### Known Limitations (`linux-v2.5.0`)
- 仅覆盖 **`Linux x86_64`（`glibc >= 2.39`）** 与 DeepSeek Harness **`0.2.2-rc.5`**（CLI / Web）；Windows x64 用户请继续使用双平台 `v2.3.0`；
- 不含 V2.5.1 的河洛序三层 UI 视觉重构（如需新版三层 UI，请直接安装最新 **`linux-v2.5.1`**）。

## [2.4.0] (`linux-v2.4.0`) - 2026-11-27

**Linux `x86_64` 独立发行版**（纯 Team 模式产品化终验冻结版，闭源免费公开发行，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）：

### Added
- **内置轻量 API Key 网关与统一模型池**：
  - 支持单向加密写入本地 `0600` 凭据库、单供应商多 Key 顺位容灾切换（`401/403/429/5xx` 自动切备用 Key）、多协议原生转发（OpenAI Chat Completions / OpenAI Responses / Anthropic Messages / Google Generative AI）与统一协议适配；
  - 支持多 Key 联合目录发现、手动补充模型、显式区分「目录声明（`catalog_only`）」「连通探测（`probe_verified`）」「实调验证（`call_verified`）」三层能力状态，保留独立外部网关与 Solo-Key 直连并存。
- **Mapper 深度治理与独立工作台（`/lt`）**：
  - 集成 LT 原生工作台（`/lt`）与河洛序多主题体系（纯白高可读默认底色、玄墨暗色、河洛序原色与自定义主题），支持 DSH 侧栏一键切换与 `Alt+Shift+L` 同会话无损往返；
  - 提供 7 角色独立模型与推理档位治理、执行主备路由链配置、路由模拟与 `[n. X-Y]` 执行槽位跨轮回读诊断视图。
- **衡账模块化整合与三源对账**：
  - 打通 DSH 会话日志（`session.v4.jsonl.zstd`）、LT 治理账本与轻量网关尝试日志，区分逻辑请求与物理尝试，支持 4 桶缓存 Token 计费、跨供应商同名模型独立计价、DeepSeek 错峰折算与未知费用显式留空（`unknown != 0`）。
- **公共契约对齐**：完整支持 `lt.public.v1` 公开接口信封、能力描述与密钥脱敏规范。

### Fixed & Hardened
- 强化跨进程网关启停锁与多 `dsh --profile web` 实例共享网关停机归属保护；
- 强化悬空符号链接路径穿越拦截、POSIX Shell 写入边界校验、HTTP 200 SSE 流内错误实时落盘及无父会话日志的子会话衡账统计。

### Known Limitations (`linux-v2.4.0`)
- 本次发行包仅覆盖 **`Linux x86_64`（`glibc >= 2.39`）** 与 DeepSeek Harness **`0.2.2-rc.5`**（CLI / Web）；Windows x64 用户请继续使用双平台 `v2.3.0` 直至 Windows 独立发行线发布；
- 纯 Team 治理模式（不含 V2.5 会话内 Single / Team 双模式）；
- 衡账默认读取 DSH `session.v4.jsonl.zstd` 压缩会话日志；部分边缘计量与手动探测细节将在后续 V2.6 维护版中统一收敛。

## [2.3.0] - 2026-11-26

双平台（`Linux x86_64` & `Windows x64`）原生模型映射与跨轮事实回读版（免费公开发行制品，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）：

### Added
- **原生模型映射与跨轮回读子系统（Rust Node-API + 宿主桥接）**：
  - 新增 `leaderteam/native/mapper.linux-x64.node` 与 `leaderteam/native/mapper.win32-x64.node` 双平台原生模块（启用 Electron/Node 延迟加载兼容）及宿主桥接层 `leaderteam/host/mapper.mjs`；
  - 支持稳定执行者编号（`executor_n`）与轮次递增（`round`）、紧邻上一轮实际模型回读核对（`previous_model`：`match` / `mismatch` / `unverifiable` / `no_prior` / `omitted` 非阻塞事实记账）、四层模型身份分离记录（配置目标、宿主路由、上游 `pi-ai` v2 披露型号与显式 `vendor`）及持久账本 `mapping.jsonl`；
  - 支持执行成员有序异构备用路由链（`team.executionFallbacks`）与 `"default"` 跟随领队路由；仅在未检测到任何工具调用尝试时允许自动切换备用模型，并按各候选自身 `maxTokens` 上限发送请求；
  - `bin/lt-doctor.mjs` 新增 `NATIVE_MAPPER` 原生模块加载与冒烟预检，新增《[V2.3 原生模型映射与跨轮回读指南](docs/09-V2.3模型映射与回读指南.md)》。

### Fixed
- **同步合入 `2.2.1` 公共核心稳定性改进**：包含调度器零派发唤醒与终态轮询抑制、常规区间滞回死区、供应商策略拒绝（`CONTENT_REFUSED`）停止重试与补审重发、双审回执绑定送审材料摘要、多供应商兜底路由成对核对、`off → none` 线协议映射统一及多配置文件事务性写盘。

## [2.2.0] - 2026-11-23

跨平台一等公民支持、标准 `dsh.bundle` 分发、零网关 Solo-Key 起手与长工程韧性增强版（纯 Node.js ESM，Apache-2.0）：

### Added
- **标准 `dsh.bundle` 一行安装与零配置自举**：新增根级 package.json、cordis.patch.yml、`icon.svg` 与中英多语言元数据，支持通过 `dsh plugin --profile web|desktop add` 或 `.tgz` 离线包直接安装；未显式传入 `configPath` 时自动在 `<DSH_HOME>/leaderteam/config/` 初始化配置。
- **Linux 与 Windows 双一等公民支持**：
  - 重构 leaderteam/host/host-imports.mjs，同时支持官方 Desktop（`app.asar`）与 Linux / WSL2 / macOS / Windows 下的 `@deepseek-ai/dsh` CLI、`dsh web` 及 `dsh headless` 宿主寻址；
  - 增强 leaderteam/core/scheduler.mjs 的 Linux `/proc/meminfo` 与 **`cgroup v2` / `cgroup v1`** 容器内存/CPU 限额识别，防止容器环境误判宿主机内存导致 OOM；
  - 强化 leaderteam/core/gate-policy.mjs 对 Linux `bash` 命令替换、进程替换、符号链接逃逸、重定向、目录逃逸与后台守护进程的确定性前置拦截。
- **电池感知式安全收尾（Battery-Aware Graceful Shutdown）**：新增纯状态机 `leaderteam/core/power-monitor.mjs` 与零依赖无窗适配层 `leaderteam/host/power-adapter.mjs`。默认每 12 分钟（10~15 分钟可配）静默检测一次电源状态（仅读取是否电池供电与电量百分比，支持 `powerMonitor.enabled: false` 随时关闭）；电池供电 `<= 20%` 时持久化通知领队有序保存检查点收尾（不强杀进程），插电或回升 `>= 25%` 仅重置触发器而不擅自自动恢复已暂停工程，VPS 无电池与 WSL2 未知状态安全静默跳过。
- **Solo-Key 免网关极简起手（`leaderteam/core/solo-key.mjs`）**：自动识别 `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`、`ZHIPU_API_KEY`、`OPENAI_API_KEY` 等单通道环境变量，无需前置部署本地 Magpie 网关即可生成合规角色配置直跑。
- **不削弱治理的 5 小时滚动请求窗口守卫（`leaderteam/core/request-window.mjs`）**：严格区分 `local-estimate`（本地估算）与 `provider-confirmed`（上游确认配额，未知保持 `unknown`）；按「抑制非必要探测 → 限制新派发并发 → 可审计检查点暂停」三级节流，**全程严禁静默跳过或削弱既定双审与安全门**。
- **转化与排障三件套**：新增跨平台 `bin/lt-doctor.mjs`（含未验证宿主离线探测与 Windows `Win32 5` ACL 修复命令提示）、`bin/lt-bugreport.mjs`（严格剥离密钥/路径/用户名的脱敏诊断导出）、`examples/smoke-bugfix/` 微型冒烟示例仓与 `.github/ISSUE_TEMPLATE/`，完成 [README.md](README.md) 三屏重构。
- **宿主兼容范围扩展**：经实测验证支持官方 DeepSeek Harness `0.2.2-rc.1` 至 `0.2.2-rc.5`（未验证版本严格维持 Fail-Closed 拒绝进入受保护生产运行）。

## [2.1.1] - 2026-11-23

发布就绪（Release Readiness）文档、契约与 CI 修正（不改变核心治理行为）：

### Fixed
- 修正 [docs/01-配置与接口.md](docs/01-配置与接口.md) 与 [docs/07-按需工具与技能.md](docs/07-按需工具与技能.md) 中的配置契约与默认值错误：`governance.mode` 仅接受 `"autonomous"` / `"approval"`（移除错误的 `"legacy"`）、补齐精确字段名（`caucusQuorumNumerator`、`caucusQuorumDenominator`、`maxInternalArbitrationRounds`、`maxConferenceDialogueTurns`、`directExecMaxSteps`、`pauseBarrierTimeoutMs` 及 `circuitBreaker.*` 白名单）、更新 `gate.ruleOnlyTools` 允许列表（`team_note`/`team_plan`/`team_conference`）、修正 `team.maxMembersPerTeam` 默认值（`128`）与 `roles.gate.maxTokens`（`8000`，无固定 `16384` 上限）。
- 更新 docs/05-验收清单.md，明确区分 V2.1 默认自治模式场景（`it42`–`it45`）与审批兼容/通用核心场景（`it01`–`it40`），核准场景文件名与数量（38 个单元测试文件、45 个集成场景文件）；同步修正 test/install-desktop.test.ps1 中硬编码旧模型名 `antigravity/gemini-4-argon` 的断言，改为动态读取 `config/leaderteam.config.json` 中的模型列表。
- 统一 [README.md](README.md)、[docs/官方Desktop部署与恢复.md](docs/官方Desktop部署与恢复.md) 与 [docs/08-可视化与用量.md](docs/08-可视化与用量.md) 的 Node.js 版本说明（LT 核心 `>= 22.15`，构建随仓 `dsh-context` 为 `^22.19.0 || >= 24.0.0`，建议 `22.19+` 或 `24.x`）。

### Added & Improved
- 优化 [README.md](README.md) 首次使用体验：前置环境要求与快速安装步骤，明确标注默认配置中的 `codex/*`、`zcode/*`、`antigravity/*` 为示例路由，提示用户按自身网关修改。
- 补全 leaderteam/NOTICE 第三方署名与修改声明，涵盖 `dsh-auto-review v0.15.0`、`dsh-context 0.82.1-leaderteam.1`（`bowenliang123/dsh-context`）与 `@deepseek-ai/dsh-sandbox-windows-acl`。
- 新增最小 Windows 单元测试工作流 .github/workflows/unit-tests.yml（Node 22/24，不依赖真实 Desktop 或付费模型）。

## [2.1.0] - 2026-11-23

LeaderTeam V2.1 首个公开发布基线版本（适配官方 DeepSeek Harness Desktop `0.2.2-rc.1`）。

### 核心架构与治理体系（Autonomous Execution & Governance）
- **分权治理重设计**：确立「领队自主执行、双评审异步监督、独立裁断介入纠偏、安全门最高约束、人工处理最终争议」的自治协作架构；仅安全门与独立裁断拥有直接阻断执行或派发的权力。
- **领队自主派发与直属执行模型（`team_direct_exec`）**：领队无需等待双评审审批即可直接派发阶段成员；新增高自由度、工作区沙箱最低权限锁定的直属执行模型，承担局部探查、快速冒烟与小范围修复。
- **四阶段争议升级与正式会商机制（`team_conference`）**：
  - 双评审后台异步监督，非一致异议作为无阻塞参考建议回注领队；按 `(stageId, stageHash, targetFileHashes)` 自动去重避免重复审查。
  - 双评审一致异议进入「双评审 + 独立裁断」三方预议（2/3 多数表决门槛）。
  - 正式二方会商开启前，在途执行成员与直属执行模型执行即时交接检查点屏障（Immediate Handoff Checkpoint Barrier）并绑定 `conferenceId` 世代防竞态恢复。
  - 独立裁断整改指令（`enforce_correction`）须经实质完成度验证方可销账，禁止仅凭工作区文件变化自动销账。
- **事件-行为-争议链身份识别与三次异议上调人工**：以底层工程事件 ID 与实际决策行为身份追踪争议连续性（文件 SHA-256 仅作辅助证据，防无关文件修改重置计数）；同一争议链第 3 次触发一致异议时直接暂停并上调人工决策。

### 模型容量、执行连续性与防空转护栏
- **真实模型能力直通**：自动探测并同步上游模型真实 `contextWindow` 与 `maxTokens` 参数，移除固定硬编码上限；推理预算与可用输出空间分离管理。
- **单次输出截断（`max-tokens`）无损自动续接**：领队与全部执行成员在触及单轮输出上限时保留完整上下文、读取状态与已成功工具列表，从中断处原位继续，禁止将正常截断判败或强拆微阶段。
- **独立熔断调查与原位恢复**：仅在持续零进展、重复相同报错或长串空转时触发软/硬双级异常检测，调用独立调查 Agent 分析现场并原位引导恢复（识别正常长只读任务防误杀）。
- **双层阻塞区分与停机审查收口**：
  - 局部可解阻塞或尚有未完成非受阻代码阶段时，自主化解并推进到底，减少打断人工；
  - 所有非受阻工作完成后遇到全局/边界硬阻塞（如会话根沙箱 `Win32 5` 权限缺失、越界路径限制或人工业务确认）时确定性直接停机（跨宿主重启自动从 `members.jsonl` 恢复沙箱故障证据）；
  - 收回初审模型对停机的无限否决权：二次停机分歧自动升级独立裁断（`stop-review-arbiter`），单任务最多允许驳回 2 次，严禁跨目录拷贝工程（如 `%TEMP%`）等无意义绕行浪费额度。

### 安全门、调度与可视化
- **分层沙箱确定性安全门与模式缓存**：工作区沙箱内合规文件操作与常规命令走确定性规则秒级放行（`0` 模型调用），跨边界操作走无工具模型审查并缓存安全模式，保留完整 `gate.jsonl` 审计回执与 Fail-Closed 版本指纹校验。
- **资源感知弹性并发与按需工具/技能投影**：实时融合用户并发上限、本机 CPU/内存/提交空间与上游限流信号调节执行并发；按任务精确裁剪成员可见工具 schema 与技能快照。
- **内嵌控制台与用量可观测性**：提供 Cordis 模块化子插件体系（`core`、`lead`、`scheduler`、`consensus`、`timer-archive`、`panel`）及适配团队编队与 `usage.jsonl` 账本统计的 `dsh-context` 扩展。
