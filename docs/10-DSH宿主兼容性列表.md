# DeepSeek Harness (DSH) 宿主版本兼容性列表

本文档提供 **LeaderTeam** 与 **DeepSeek Harness (DSH)** 官方桌面端（Desktop）、Web 控制台及命令行（CLI / Headless）的完整兼容性矩阵、安装前预检方法与自适应解耦机制说明。

---

## 一、快速查询：支持范围与推荐版本

- **插件包声明范围（`engines.dsh`）**：`>=0.2.2-alpha.2 <1.0.0`（完整覆盖预发布通道 `alpha`、`rc` 与正式版）
- **Node.js 运行时要求**：`>= 22.15`（推荐 `22.19+` 或 `24.x`；官方 Windows 桌面端内置 Electron 运行时无需单独安装 Node.js 即可运行一键安装器）
- **推荐宿主版本**：
  - **官方 Windows 桌面端（Desktop）**：`0.2.2-rc.1` 及后续 `0.2.2+` / `0.2.3+` 桌面更新
  - **Linux / WSL2 / Windows CLI & Web（`dsh web`）**：`0.2.2-rc.5`（当前 `latest`）及后续更新
  - **官方预览通道（Preview / Alpha）**：`0.2.3-alpha.2`

---

## 二、DSH 宿主版本兼容性矩阵

| DSH 版本系列 | 适用宿主形态 | 支持平台 | 兼容等级 | 生产可用 | 安全门状态 | 详细说明 |
|---|---|---|---|---|---|---|
| **`0.2.2-rc.5`**（当前 `latest` / `next`） | CLI / `dsh web` / `dsh headless` | Linux x86_64、WSL2、Windows x64 | **已实机认证** (`VERIFIED`) | ✅ 是 | 100% 挂载 | 生产环境 CLI / Web 首选版本，全量通过单测、契约与真实宿主集成套件。 |
| **`0.2.2-rc.1`**（官方桌面端基线） | Official Desktop / CLI / Web | Windows x64、Linux x86_64、WSL2 | **已实机认证** (`VERIFIED`) | ✅ 是 | 100% 挂载 | 官方 Windows Desktop 安装包与 CLI 端到端验真基线。 |
| **`0.2.2-rc.2` ~ `0.2.2-rc.4`** | Official Desktop / CLI / Web | Windows x64、Linux x86_64、WSL2 | **已核验放行** (`VERIFIED`) | ✅ 是 | 100% 挂载 | `ToolExecutionPipeline`、`ToolsService` 与会话协议与 `rc.1`/`rc.5` 完全一致。 |
| **`0.2.2-alpha.2` ~ `0.2.2-alpha.3`** | CLI / `dsh web` / `dsh headless` | Linux x86_64、WSL2、Windows x64 | **已核验放行** (`VERIFIED`) | ✅ 是 | 100% 挂载 | 首次引入 `ToolExecutionPipeline` 安全门挂载点的最低支持起点。 |
| **`0.2.3-alpha.1` ~ `0.2.3-alpha.2`** | Official Desktop / CLI / Web | Linux x86_64、WSL2、Windows x64 | **已实机认证** (`VERIFIED`) | ✅ 是 | 100% 挂载 | 最新 `0.2.3` 预览通道已实机通过插件安装、安全门拦截与 `lt-doctor` 复验。 |
| **`0.2.2` 正式版 / `0.2.3+` / `0.3.x`**（`< 1.0.0`） | Official Desktop / CLI / Web | Windows x64、Linux x86_64、WSL2 | **结构契约兼容** (`CONTRACT_COMPATIBLE`) | ✅ 是 | 启动时动态验真 | **解除固定版本号强绑定**：只要后续宿主未破坏 `ToolExecutionPipeline` 与 `ToolsService` 安全门契约即可免升级直跑。 |
| **`<= 0.2.1-rc.5` / `0.2.0.x` / `0.13.x`** | 旧版 Desktop / 旧版 CLI | 全部平台 | **不支持** (`UNSUPPORTED`) | ❌ 否 | 缺少挂载点 | 尚未引入 `@deepseek-ai/dsh-tools/pipeline`，安装期与启动期均会明确拦截并提示升级 DSH。 |

---

## 三、如何减少宿主更新带来的兼容性风险（自适应结构契约机制）

早期版本将宿主版本硬编码锁定在少数固定字符串上，导致用户升级官方桌面端或 CLI 小版本后因版本号不在白名单而被阻断。现已升级为 **三层结构契约自适应验证机制（`host-compat`）**：

1. **第一层（安装期范围准入）**：`package.json` 的 `engines.dsh` 采用语义化范围 `>=0.2.2-alpha.2 <1.0.0`，让 DSH 官方插件管理器自动放行 `0.2.2`、`0.2.3`、`0.3.x` 等同主版本演进，同时在安装前直接拦截无安全门能力的 `0.2.1` 及更老版本。
2. **第二层（启动期结构契约校验，替代脆弱字符串白名单）**：
   - 启动时不再因为宿主版本号未写死在数组里而拒绝启动，而是对宿主运行时的 `ToolExecutionPipeline.prototype.dispatchToolBody`、`resolveExecution` 与 `ToolsService.prototype.resolve` 执行空白/转译无关的**结构契约核验**（兼容 `void 0` / `undefined` / `Boolean()` 等打包器差异）；
   - 验证通过即标记为 `VERIFIED`（已入库实测版本）或 `CONTRACT_COMPATIBLE`（结构契约兼容新版本），完整挂载零延迟确定性安全门；
   - 如对合规审计有严格锁版要求，可在 `leaderteam.config.json` 中设置 `"gate": { "hostCompatibilityPolicy": "strict-verified" }` 切回仅允许实测白名单模式。
3. **第三层（破坏性变更 Fail-Closed 兜底）**：若未来某个 DSH 大版本重构了工具执行管道导致安全门无法可靠拦截，LT 绝不裸奔放行，而是确定性触发 `INCOMPATIBLE_PIPELINE` **Fail-Closed** 阻断并在控制台与 `lt-doctor` 中给出清晰升级提示。

---

## 四、安装前一键检查当前 DSH 是否受支持

- **方式 A（零命令行图形化）**：双击运行一键安装器（Windows `Install-LeaderTeam.cmd` / Linux `install-leaderteam.sh`），首页会自动扫描本机全部 DSH 客户端与 CLI 位置并展示绿/黄/红兼容性徽章。
- **方式 B（命令行快速自检）**：
  ```bash
  # 打印完整兼容性列表
  node bin/lt-doctor.mjs --compatibility-matrix

  # 自动扫描本机已安装的 DSH 并验证兼容性
  node bin/lt-doctor.mjs

  # 检测指定路径下的 DSH Desktop（支持目录或 app.asar）
  node bin/lt-doctor.mjs --check-host "%LOCALAPPDATA%\Programs\DeepSeek Harness"
  ```
