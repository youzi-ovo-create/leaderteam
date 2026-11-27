# LeaderTeam Releases (`V2.3+` 闭源免费公开发行仓)

![Windows Latest](https://img.shields.io/badge/Windows%20x64-windows--v2.6.0%20(Stable)-0078d4)
![Linux Latest](https://img.shields.io/badge/Linux%20x64-linux--v2.6.0%20(Stable)-blue)
![DSH Host](https://img.shields.io/badge/DeepSeek%20Harness-%3E%3D0.2.2--alpha.2%20%3C1.0.0-5b6ee1)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.15-339933)
![License](https://img.shields.io/badge/license-Closed--Source%20Free%20Distribution-orange)

本仓库是 **LeaderTeam for DeepSeek Harness** `V2.3+` 演进线的独立公开制品发行仓，仅发布经实机验收的标准安装包（`.tgz`）、独立衡账包、一键图形化安装器、SHA-256 校验文件、版本说明、缺陷披露报告、用户文档与许可证文件。

> **📢 透明披露与阶段寄语**：
> - 自 `v2.3.0` 发布以来的全部真实缺陷、根因、修复方案及现存开放边界，详见 **[《LeaderTeam V2.3–V2.6 缺陷披露与稳定性修复报告》](docs/V2.3-V2.6缺陷披露与修复报告.md)**。
> - 作者的 V2.6 新阶段思考与四分支维护承诺（注：报告体整活文风，维护态度认真），见 **[《回顾来路 立足当下 开创未来》](docs/V2.6阶段寄语与维护承诺.md)**。

> **什么是 LeaderTeam？**  
> LeaderTeam 是运行在 **DeepSeek Harness（DSH）** 上的多 Agent 分权自治工程协作插件：你只需提交一句工程需求，领队模型自动拆解并并行派发执行成员，双评审后台异步监督、独立裁断按需介入纠偏，并配备 `0ms` 确定性宿主安全门与四桶物理 Token 账本。本仓发布的 `V2.3+` 闭源免费版在此基础上增加了 **Rust Node-API 原生模型映射核心**、**内置轻量 API Key 多协议网关**、**会话内 Single / Team 双模式切换**与**衡账三源对账**。

> **发行性质与双平台独立发行说明（闭源免费公开发行）**：
> - `LeaderTeam V2.3+` 为**闭源免费公开发行版本**——预编译原生模块与专有演进源码不对外公开，但安装包**免费向所有个人开发者、学术研究、技术评测及企业内部研发开放下载使用**（具体授权边界与原开源组件权利保留条款见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）。
> - **V2.6 为相对长期维护稳定线**：后续将根据真实使用与外部反馈按需发布 `v2.6.1`、`v2.6.2` 等维护版；Windows（`windows-vX.Y.Z`）与 Linux（`linux-vX.Y.Z`）共享通用修复，各自独立验收并独立发版、互不等待。
> - 纯 Node.js 开源维护线（`V2.2.x`）继续在 [`youzi-ovo-create/dsh-leaderteam`](https://github.com/youzi-ovo-create/dsh-leaderteam) 公开维护。

---

## 各平台最新可用版本总览

| 平台 / 发行轨道 | 最新可用 Release | 同系列可选 / 历史版本 | 核心能力与实测宿主范围 |
|---|---|---|---|
| **Windows `x64` 最新稳定版** | **[`windows-v2.6.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/windows-v2.6.0)**（含独立衡账包 `lt-usage-plugin-windows-v2.6.0.tgz`、验证包与缺陷报告） | [`windows-v2.5.1`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/windows-v2.5.1) · [`windows-v2.5.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/windows-v2.5.0) · [`windows-v2.4.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/windows-v2.4.0) | **V2.6 稳定维护基线**：120s 首有效事件 / 90s 流空闲超时与 `0-tool` 备用回退、收尾按需工具校验、网关热路径配置缓存、12 分钟长推理衡账与跨网关去重、工作台首访引导/1400px 无遮挡布局/跨标签同步与系统提示行；兼容 DSH `>=0.2.2-alpha.2 <1.0.0`（官方 Desktop `0.2.2-rc.1` 54/54 宿主集成全过） |
| **Linux `x86_64` 最新稳定版** | **[`linux-v2.6.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.6.0)** | [`linux-v2.5.1`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.5.1) · [`linux-v2.5.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.5.0) · [`linux-v2.4.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.4.0) | **V2.6 稳定维护基线**：会话内 Single / Team 双模式 + 河洛序三层 UI + 宿主兼容与会话级配置同步 + 失败尝试计费与公共账单一致性 + 跨窗口字段级改价合并 + 四协议实调严校验与端点竞态防护 + 热回滚完整性与配置预检 + 跨架构更新隔离 + 衡账未压缩 `session.v4.jsonl` 读取与时间窗联动；`glibc >= 2.39`，Ubuntu 24.04 + DSH `0.2.2-rc.5` CLI/Web 52/52 实机全量验收通过 |
| **双平台历史基线 (`v2.3.0`)** | [`v2.3.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/v2.3.0) | — | 双平台预编译 Rust Node-API 模型映射核心与异构执行备援链（支持 Windows Desktop `0.2.2-rc.1` 与 CLI/Web `0.2.2-rc.5`） |
| **V2.2.x 开源维护线** | [`youzi-ovo-create/dsh-leaderteam`](https://github.com/youzi-ovo-create/dsh-leaderteam) | [`windows-v2.2.3`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/windows-v2.2.3) / [`linux-v2.2.3`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/linux-v2.2.3) / [`v2.2.1`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/v2.2.1) | 纯 Node.js ESM `Apache-2.0` 开源核心源码、安装包与历代工程实证报告 |

---

## 快速安装

### 1. 经实机验证的平台、宿主兼容范围与首次安装要求

- **支持平台与架构**：
  - **`Windows x64`**（独立 Node.js 与官方桌面端 Electron）：推荐使用最新稳定版 **[`windows-v2.6.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/windows-v2.6.0)**（历史系列保留 `windows-v2.5.1` / `windows-v2.5.0` / `windows-v2.4.0`）；
  - **`Linux x86_64`**（`glibc >= 2.39`，已于 Ubuntu 24.04 x86_64 实机验证）：推荐使用最新稳定版 **[`linux-v2.6.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.6.0)**（历史系列保留 `linux-v2.5.1` / `linux-v2.5.0` / `linux-v2.4.0`）；
  - *非支持平台行为说明*：`macOS` 加载时会自动跳过原生映射模块；`Linux arm64`、`Windows arm64` 及基于 `musl` 的 Linux（如 Alpine）不在当前二进制包支持范围内（Fail-Closed）。
- **Node.js 要求**：`>= 22.15`（推荐 `22.19+` 或 `24.x`；Windows 图形化一键安装器亦可自动复用官方桌面端内置 Electron 运行时，无需预装 Node.js）。
- **DeepSeek Harness 宿主兼容范围**（详见《[DSH 宿主版本兼容性列表](docs/10-DSH宿主兼容性列表.md)》）：
  - `windows-v2.6.0` / `windows-v2.5.1` / `windows-v2.5.0` / `windows-v2.4.0`：支持 **`>=0.2.2-alpha.2 <1.0.0`**（含结构契约自适应校验，官方 Windows Desktop `0.2.2-rc.1` 实机全链路验收；缺失安全门管道的 `<= 0.2.1-rc.5` 保持 Fail-Closed 拦截）；
  - `linux-v2.6.0`：支持 **`>=0.2.2-alpha.2 <1.0.0`**（含结构契约自适应校验，Ubuntu 24.04 + DSH **`0.2.2-rc.5`** CLI/Web 全量 52/52 实机验收）；`linux-v2.5.1` / `linux-v2.5.0` / `linux-v2.4.0` 已通过 **`0.2.2-rc.5`**（CLI / Web）实机验收；
  - `v2.3.0`：已通过实机验收 **`0.2.2-rc.1`**（官方 Windows Desktop）与 **`0.2.2-rc.5`**（CLI / Web）。
- **首次安装前置要求**：
  - **官方 Windows Desktop（`--profile desktop`）**：① 全新安装官方 DeepSeek Harness Desktop 后，请**先启动一次官方客户端**以完成 `desktop` profile 初始化，随后**完全退出客户端（含托盘图标）**；② 可直接双击 **`Install-LeaderTeam.cmd`** 图形化向导安装（自动识别自定义安装目录如 `D:\Apps\DeepSeek-Harness`），或使用官方桌面端自带 `dsh.cmd`（位于 `<客户端安装目录>\resources\runtime\cli\bin\dsh.cmd`）执行安装；
  - **Linux / Web CLI（`--profile web`）**：执行 `dsh plugin --profile web add` 前，需确保系统 `PATH` 中包含可用的 `node` 与 `pnpm`（可通过 `corepack enable pnpm` 启用）。

### 2. 下载校验与一键 / 命令行安装

#### A. Windows `x64` 最新稳定版（`windows-v2.6.0`）

- **方式一（推荐 · 零命令行图形化一键安装）**：从 [`windows-v2.6.0` Release 页面](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/windows-v2.6.0) 下载 `Install-LeaderTeam.cmd`、`lt-installer-standalone.mjs` 与 `dsh-leaderteam-2.6.0.tgz` 至同一目录（或克隆本仓），双击 **`Install-LeaderTeam.cmd`** 即可在浏览器向导中自动识别 DSH、校验 `SHA-256` 并一键安装（详见《[一键安装、新手引导与自动更新指南](docs/11-一键安装新手引导与自动更新指南.md)》）。
- **方式二（PowerShell 校验并命令行安装）**：

```powershell
# 1. 下载 Windows x64 安装包与校验文件并核对 SHA-256
curl.exe -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/windows-v2.6.0/dsh-leaderteam-2.6.0.tgz
curl.exe -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/windows-v2.6.0/SHA256SUMS.txt
Get-FileHash .\dsh-leaderteam-2.6.0.tgz -Algorithm SHA256

# 2A. 官方 Windows x64 Desktop 环境安装（先完全退出已初始化的桌面端，并使用桌面端自带 dsh.cmd）
dsh plugin --profile desktop add .\dsh-leaderteam-2.6.0.tgz

# 2B. 独立 CLI / Web 环境安装（web profile）
dsh plugin --profile web add .\dsh-leaderteam-2.6.0.tgz
```

> `windows-v2.6.0` 随附独立衡账包 `lt-usage-plugin-windows-v2.6.0.tgz`、独立复测包 `windows-v2.6.0-verification.zip` 及完整《[V2.3–V2.6 缺陷披露与稳定性修复报告](docs/V2.3-V2.6缺陷披露与修复报告.md)》。

#### B. Linux `x86_64` 最新稳定版（`linux-v2.6.0`）

```bash
# 1. 下载安装包与校验文件并核对 SHA-256
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/linux-v2.6.0/dsh-leaderteam-2.6.0-linux-x64.tgz
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/linux-v2.6.0/SHA256SUMS.txt
grep "dsh-leaderteam-2.6.0-linux-x64.tgz" SHA256SUMS.txt | sha256sum -c -

# 2. 安装至 DSH web profile
dsh plugin --profile web add ./dsh-leaderteam-2.6.0-linux-x64.tgz
```

> 历史版本仍保留可供按需安装：[`linux-v2.5.1`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.5.1)（河洛序三层 UI 冻结版）、[`linux-v2.5.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.5.0)（双模经典 UI）、[`linux-v2.4.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.4.0)（纯 Team 治理基线），均以相同方式校验并安装。

安装完成后，可在插件安装目录执行 `node bin/lt-doctor.mjs` 检查宿主连接与原生模块状态（`nativeMapper: pass`）。

---

## 版本升级与回退

- **在同平台各版本（`v2.3.0` / `v2.4.0` / `v2.5.0` / `v2.5.1` / `v2.6.0`）之间切换或升级**：可在 `/lt` 控制台「设置 → 版本更新与兼容」点击一键升级，或对同一 profile 执行 `dsh plugin --profile <web|desktop> add ./<目标版本>.tgz` 原地替换，`<DSH_HOME>/leaderteam/` 下的本地配置、网关凭据库、单会话覆盖（`session-configs/`）及团队账本自动保留。
- **切换至开源版（`V2.2.3` / `V2.2.2` / `v2.2.1`）**：从开源主仓下载对应平台安装包（如 [`linux-v2.2.3`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/linux-v2.2.3) / [`windows-v2.2.3`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/windows-v2.2.3) 或历史 [`v2.2.1`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/v2.2.1)）并执行 `dsh plugin --profile <web|desktop> add ./dsh-leaderteam-<version>.tgz` 即可切换。

---

## 用户文档、缺陷披露报告、许可协议与实证报告

- **缺陷披露与阶段寄语**：
  - [**LeaderTeam V2.3–V2.6 缺陷披露与稳定性修复报告**](docs/V2.3-V2.6缺陷披露与修复报告.md)（完整汇总自 `v2.3.0` 以来的全部真实 Bug、根因、修复方案、实测结果与现存开放边界）
  - [**回顾来路 立足当下 开创未来（V2.6 阶段寄语与维护承诺）**](docs/V2.6阶段寄语与维护承诺.md)（整活报告体文风，附作者对四分支问题反馈的认真维护承诺）
- **使用指南、安装与架构文档**：
  - [一键安装、新手引导与自动更新指南](docs/11-一键安装新手引导与自动更新指南.md) · [DSH 宿主版本兼容性列表](docs/10-DSH宿主兼容性列表.md)
  - [V2.3 原生模型映射与跨轮回读指南](docs/09-V2.3模型映射与回读指南.md)
  - [日常使用指南](docs/使用指南.md) · [配置与接口参考](docs/01-配置与接口.md) · [架构总览](docs/00-总览.md) · [按需工具与技能](docs/07-按需工具与技能.md) · [可视化与用量账本](docs/08-可视化与用量.md)
  - [官方 Desktop 部署与恢复](docs/官方Desktop部署与恢复.md) · [官方客户端更新复验](docs/官方Desktop更新复验.md) · [版本更新日志 (`CHANGELOG.md`)](CHANGELOG.md)
- **许可证与第三方归属声明**：
  - [LeaderTeam 2.3+ 免费发行使用许可协议 (`LICENSE`)](LICENSE)
  - [原有开源基座与第三方组件许可证全文 (`THIRD_PARTY_LICENSES`)](THIRD_PARTY_LICENSES)
- **历代工程实证报告（托管于开源主仓 `docs/benchmarks/`）**：
  - [LeaderTeam V2.2 工程实证报告：49 分钟完成 Linux 跨语言核心模块自举与宿主集成](https://github.com/youzi-ovo-create/dsh-leaderteam/blob/main/docs/benchmarks/LeaderTeam_V2.2_Linux%E8%B7%A8%E8%AF%AD%E8%A8%80%E8%87%AA%E4%B8%BE%E5%B7%A5%E7%A8%8B%E5%AE%9E%E8%AF%81%E6%8A%A5%E5%91%8A.md)（附 [脱敏核验回执与复算脚本](https://github.com/youzi-ovo-create/dsh-leaderteam/tree/main/docs/benchmarks/evidence/v2.2-linux-selfhost)）
  - [LeaderTeam V1.1–V2.2：基于五项真实工程实测的架构演进与发展潜力分析](https://github.com/youzi-ovo-create/dsh-leaderteam/blob/main/docs/benchmarks/LeaderTeam_V1.1%E8%87%B3V2.2_%E6%9E%B6%E6%9E%84%E6%BC%94%E8%BF%9B%E4%B8%8E%E5%8F%91%E5%B1%95%E6%BD%9C%E5%8A%9B%E5%88%86%E6%9E%90.md)
  - [LeaderTeam V2.1 双项复杂工程实跑测评报告](https://github.com/youzi-ovo-create/dsh-leaderteam/blob/main/docs/benchmarks/LeaderTeam_V2.1_%E5%8F%8C%E9%A1%B9%E5%B7%A5%E7%A8%8B%E5%AE%9E%E8%B7%91%E6%B5%8B%E8%AF%84%E6%8A%A5%E5%91%8A.md)
