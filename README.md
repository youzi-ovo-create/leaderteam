# LeaderTeam Releases (`V2.3+` 闭源免费公开发行仓)

![Linux Latest](https://img.shields.io/badge/Linux%20x64-linux--v2.5.1-blue)
![Dual Platform](https://img.shields.io/badge/Linux%20%2B%20Windows%20x64-v2.3.0-success)
![DSH Host](https://img.shields.io/badge/DeepSeek%20Harness-0.2.2--rc.1%20%7C%200.2.2--rc.5-5b6ee1)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.15-339933)
![License](https://img.shields.io/badge/license-Closed--Source%20Free%20Distribution-orange)

本仓库是 **LeaderTeam for DeepSeek Harness** `V2.3+` 演进线的独立公开制品发行仓，仅发布经实机验收的标准安装包（`.tgz`）、SHA-256 校验文件、版本说明、用户文档与许可证文件。

> **发行性质与平台解耦声明（闭源免费公开发行）**：
> - `LeaderTeam V2.3+` 为**闭源免费公开发行版本**——预编译原生模块与专有演进源码不对外公开，但安装包**免费向所有个人开发者、学术研究、技术评测及企业内部研发开放下载使用**（具体授权边界与原开源组件权利保留条款见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）。
> - 自 `V2.4` 起，**Linux 发行线（`linux-vX.Y.Z`）与 Windows 发行线（`windows-vX.Y.Z` / 双平台合包）按各自真机验证节奏独立发行**；Windows x64 用户在 Windows 独立版发布前请继续使用双平台正式版 `v2.3.0`。
> - 纯 Node.js 开源维护线（`V2.2.x`）继续在开源主仓公开维护。

| 发行轨道 / 标签 | 仓库与发行链接 | 覆盖平台 | 主要能力与定位 |
|---|---|---|---|
| **Linux 最新发行 (`linux-v2.5.1`)** | [`linux-v2.5.1`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.5.1) | `Linux x86_64` (`glibc >= 2.39`) | 会话内 **Single / Team 双模式** + **河洛序三层 UI** + 内置轻量 API Key 网关 + 衡账三源对账 + 原生模型映射（DSH `0.2.2-rc.5`） |
| **Linux 纯 Team 基线 (`linux-v2.4.0`)** | [`linux-v2.4.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.4.0) | `Linux x86_64` (`glibc >= 2.39`) | 纯 Team 自治治理模式 + 内置轻量 API Key 网关 + 原生工作台 `/lt` + 衡账三源对账 + 原生模型映射（DSH `0.2.2-rc.5`） |
| **双平台基线 (`v2.3.0`)** | [`v2.3.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/v2.3.0) | `Linux x86_64` + `Windows x64` | 双平台预编译 Rust Node-API 模型映射核心与异构执行备援链（支持 Windows Desktop `0.2.2-rc.1` 与 CLI/Web `0.2.2-rc.5`） |
| **V2.2.x 开源维护线** | [`youzi-ovo-create/dsh-leaderteam`](https://github.com/youzi-ovo-create/dsh-leaderteam) | 跨平台纯 Node.js ESM | 纯 `Apache-2.0` 开源核心源码、安装包与历代工程实证报告 |

---

## 快速安装

### 1. 经实机验证的平台、宿主兼容范围与首次安装要求

- **支持平台与架构**：
  - `Linux x86_64`（`glibc >= 2.39`，已于 Ubuntu 24.04 x86_64 实机验证）：推荐使用最新 **`linux-v2.5.1`**（或纯 Team 基线 **`linux-v2.4.0`**）；
  - `Windows x64`（独立 Node.js 与官方桌面端 Electron）：当前请使用双平台正式版 **`v2.3.0`**；
  - *非支持平台行为说明*：`macOS` 加载时会自动跳过原生映射模块；`Linux arm64`、`Windows arm64` 及基于 `musl` 的 Linux（如 Alpine）不在当前二进制包支持范围内（Fail-Closed）。
- **Node.js 要求**：`>= 22.15`（推荐 `22.19+` 或 `24.x`）。
- **DeepSeek Harness 宿主兼容范围**：
  - `linux-v2.5.1` / `linux-v2.4.0`：已通过实机全量验收 **`0.2.2-rc.5`**（CLI / Web）；
  - `v2.3.0`：已通过实机验收 **`0.2.2-rc.1`**（官方 Windows Desktop）与 **`0.2.2-rc.5`**（CLI / Web）；
  - 未经实机验证的宿主版本默认维持 **Fail-Closed** 拒绝受保护加载（可通过包内 `lt-doctor --check-host` 离线预检）。
- **首次安装前置要求**：
  - **Linux / Web CLI（`--profile web`）**：执行 `dsh plugin --profile web add` 前，需确保系统 `PATH` 中包含可用的 `node` 与 `pnpm`（可通过 `corepack enable pnpm` 启用）；
  - **官方 Windows Desktop（`--profile desktop`，`v2.3.0`）**：① 首次安装前请**先启动一次官方 DeepSeek Harness Desktop 客户端**以完成 `desktop` profile 初始化，随后**完全退出客户端**；② 请使用**官方桌面客户端自带的 `dsh` CLI**（位于 `<客户端安装目录>\resources\runtime\cli\bin\dsh.cmd`）执行 `--profile desktop` 安装命令。

### 2. 下载校验与一行安装

#### A. Linux `x86_64` 最新发行（`linux-v2.5.1`）

```bash
# 1. 下载安装包与校验文件并核对 SHA-256
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/linux-v2.5.1/dsh-leaderteam-2.5.1-linux-x64.tgz
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/linux-v2.5.1/SHA256SUMS.txt
grep "dsh-leaderteam-2.5.1-linux-x64.tgz" SHA256SUMS.txt | sha256sum -c -

# 2. 安装至 DSH web profile
dsh plugin --profile web add ./dsh-leaderteam-2.5.1-linux-x64.tgz
```

> 如需纯 Team 治理基线（不含 Single / Team 双模式），可下载 [`linux-v2.4.0`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/linux-v2.4.0) 下的 `dsh-leaderteam-2.4.0-linux-x64.tgz` 并以相同方式安装。

#### B. 官方 Windows `x64` Desktop / 双平台基线（`v2.3.0`）

```bash
# 1. 下载安装包与校验文件并核对 SHA-256
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/v2.3.0/dsh-leaderteam-2.3.0.tgz
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/v2.3.0/SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt

# 2. 官方 Windows x64 Desktop 环境安装（先完全退出已初始化的桌面客户端，并使用桌面端自带 dsh CLI）
dsh plugin --profile desktop add ./dsh-leaderteam-2.3.0.tgz
```

安装完成后，可在插件安装目录执行 `node bin/lt-doctor.mjs` 检查宿主连接与原生模块状态（`nativeMapper: pass`）。

---

## 版本升级与回退

- **在 `v2.3.0`、`linux-v2.4.0`、`linux-v2.5.1` 之间切换或升级**：直接对同一 profile 执行 `dsh plugin --profile web add ./<目标版本>.tgz` 即可原地替换，`<DSH_HOME>/leaderteam/config/leaderteam.local.json`、网关凭据库及团队账本自动保留。
- **回退至开源版 `v2.2.1`**：从开源主仓下载 [`dsh-leaderteam-2.2.1.tgz`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/v2.2.1) 并执行 `dsh plugin --profile <web|desktop> add ./dsh-leaderteam-2.2.1.tgz` 即可回退。

---

## 用户文档、许可协议与实证报告

- **V2.3 用户文档与更新记录**：
  - [V2.3 原生模型映射与跨轮回读指南](docs/09-V2.3模型映射与回读指南.md)
  - [日常使用指南](docs/使用指南.md) · [配置与接口参考](docs/01-配置与接口.md) · [架构总览](docs/00-总览.md) · [按需工具与技能](docs/07-按需工具与技能.md) · [可视化与用量账本](docs/08-可视化与用量.md)
  - [官方 Desktop 部署与恢复](docs/官方Desktop部署与恢复.md) · [官方客户端更新复验](docs/官方Desktop更新复验.md) · [版本更新日志 (`CHANGELOG.md`)](CHANGELOG.md)
- **许可证与第三方归属声明**：
  - [LeaderTeam 2.3+ 免费发行使用许可协议 (`LICENSE`)](LICENSE)
  - [原有开源基座与第三方组件许可证全文 (`THIRD_PARTY_LICENSES`)](THIRD_PARTY_LICENSES)
- **历代工程实证报告（托管于开源主仓 `docs/benchmarks/`）**：
  - [LeaderTeam V2.2 工程实证报告：49 分钟完成 Linux 跨语言核心模块自举与宿主集成](https://github.com/youzi-ovo-create/dsh-leaderteam/blob/v2.2.1/docs/benchmarks/LeaderTeam_V2.2_Linux%E8%B7%A8%E8%AF%AD%E8%A8%80%E8%87%AA%E4%B8%BE%E5%B7%A5%E7%A8%8B%E5%AE%9E%E8%AF%81%E6%8A%A5%E5%91%8A.md)
  - [LeaderTeam V1.1–V2.2：基于五项真实工程实测的架构演进与发展潜力分析](https://github.com/youzi-ovo-create/dsh-leaderteam/blob/v2.2.1/docs/benchmarks/LeaderTeam_V1.1%E8%87%B3V2.2_%E6%9E%B6%E6%9E%84%E6%BC%94%E8%BF%9B%E4%B8%8E%E5%8F%91%E5%B1%95%E6%BD%9C%E5%8A%9B%E5%88%86%E6%9E%90.md)
  - [LeaderTeam V2.1 双项复杂工程实跑测评报告](https://github.com/youzi-ovo-create/dsh-leaderteam/blob/v2.2.1/docs/benchmarks/LeaderTeam_V2.1_%E5%8F%8C%E9%A1%B9%E5%B7%A5%E7%A8%8B%E5%AE%9E%E8%B7%91%E6%B5%8B%E8%AF%84%E6%8A%A5%E5%91%8A.md)
