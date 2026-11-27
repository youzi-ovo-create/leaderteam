# Changelog

本项目的所有重要版本变更均记录于此文件，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

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
