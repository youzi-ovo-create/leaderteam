# LeaderTeam Releases (`V2.3+` 闭源免费公开发行仓)

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![Platform](https://img.shields.io/badge/platform-Linux%20x64%20%7C%20Windows%20x64-success)
![DSH Host](https://img.shields.io/badge/DeepSeek%20Harness-0.2.2--rc.1%20%7C%200.2.2--rc.5-5b6ee1)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.15-339933)
![License](https://img.shields.io/badge/license-Closed--Source%20Free%20Distribution-orange)

本仓库是 **LeaderTeam for DeepSeek Harness** `V2.3+` 演进线的独立公开制品发行仓，仅发布经双平台真机验收的标准安装包（`.tgz`）、SHA-256 校验文件、版本说明、用户文档与许可证文件。

> **发行性质声明（闭源免费公开发行）**：
> - `LeaderTeam V2.3.0` 为**闭源免费公开发行版本**——预编译的 Rust 原生模块与专有演进源码不对外公开，但安装包**免费向所有个人开发者、学术研究、技术评测及企业内部研发开放下载使用**（具体授权边界与原开源组件权利保留条款见 [LICENSE](LICENSE) 与 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)）。
> - 纯 Node.js 开源维护线（`V2.2.1`）继续在主仓公开维护。

| 发行轨道 | 仓库地址 | 当前版本 | 包含内容与许可协议 |
|---|---|---|---|
| **V2.3+ 闭源制品线** | [`youzi-ovo-create/dsh-leaderteam-releases`](https://github.com/youzi-ovo-create/dsh-leaderteam-releases) | **`v2.3.0`** | 双平台预编译 Rust Node-API 模型映射核心（`Linux x86_64` + `Windows x64`）与宿主集成安装包、校验文件、用户文档（闭源免费发行，见 [LICENSE](LICENSE)） |
| **V2.2.x 开源维护线** | [`youzi-ovo-create/dsh-leaderteam`](https://github.com/youzi-ovo-create/dsh-leaderteam) | **`v2.2.1`** | 纯 Node.js ESM 开源核心源码、安装包与历代工程实证报告（`Apache-2.0`） |

---

## 快速安装（`v2.3.0`）

### 1. 经实机验证的平台、宿主兼容范围与首次安装要求

- **支持平台与架构**：
  - `Linux x86_64`（`glibc >= 2.39`，已于 Ubuntu 24.04 x86_64 及 WSL2 Ubuntu-24.04 实机验证）
  - `Windows x64`（同时支持独立 Node.js 进程与官方桌面端 Electron 进程）
  - *非支持平台行为说明*：`macOS` 加载时会自动跳过原生映射模块（不启用 V2.3 原生映射特性）；`Linux arm64`、`Windows arm64` 及基于 `musl` 的 Linux（如 Alpine）不在本双平台包二进制支持范围内，加载时会明确报错提示缺少对应平台二进制（Fail-Closed）。
- **Node.js 要求**：`>= 22.15`（推荐 `22.19+` 或 `24.x`）。
- **DeepSeek Harness 宿主兼容范围**：
  - 已通过端到端实机验证：**`0.2.2-rc.1`**（官方 Windows Desktop）与 **`0.2.2-rc.5`**（CLI / Web）；
  - 未经实机验证的中间或后续宿主版本默认维持 **Fail-Closed** 拒绝受保护加载（可通过包内 `lt-doctor --check-host` 离线预检）。
- **首次安装前置要求**：
  - **Linux / Web CLI（`--profile web`）**：执行 `dsh plugin --profile web add` 前，需确保系统 `PATH` 中包含可用的 `node` 与 `pnpm`（可通过 `corepack enable pnpm` 启用）；
  - **官方 Windows Desktop（`--profile desktop`）**：① 首次安装前请**先启动一次官方 DeepSeek Harness Desktop 客户端**以完成 `desktop` profile 初始化，随后**完全退出客户端**；② 请使用**官方桌面客户端自带的 `dsh` CLI**（位于 `<客户端安装目录>\resources\runtime\cli\bin\dsh.cmd`）执行 `--profile desktop` 安装命令（独立版 `0.2.2-rc.5` CLI 将 `desktop` profile 保留给桌面客户端管理，独立 CLI 自身请使用 `--profile web`）。

### 2. 下载校验与一行安装

前往 [Releases 页面 (`v2.3.0`)](https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/tag/v2.3.0) 下载，或通过命令行下载校验后安装：

```bash
# 1. 下载安装包与校验文件并核对 SHA-256
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/v2.3.0/dsh-leaderteam-2.3.0.tgz
curl -fLO https://github.com/youzi-ovo-create/dsh-leaderteam-releases/releases/download/v2.3.0/SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt

# 2A. Linux x86_64 或独立 CLI/Web 环境安装（web profile）
dsh plugin --profile web add ./dsh-leaderteam-2.3.0.tgz

# 2B. 官方 Windows x64 Desktop 环境安装（desktop profile，需先退出已初始化过的桌面客户端，并使用桌面端自带 dsh CLI）
dsh plugin --profile desktop add ./dsh-leaderteam-2.3.0.tgz
```

安装完成后，可在插件安装目录执行 `node bin/lt-doctor.mjs` 检查宿主连接与原生模块状态（`nativeMapper: pass`）。

---

## 与开源版 `v2.2.1` 的升级与回退

- **从开源版 `v2.2.1` 升级至 `v2.3.0`**：直接对同一 profile 执行 `dsh plugin --profile <web|desktop> add ./dsh-leaderteam-2.3.0.tgz` 即可原地替换升级，`<DSH_HOME>/leaderteam/config/leaderteam.local.json` 与既有团队历史账本自动保留。
- **从 `v2.3.0` 回退至开源版 `v2.2.1`**：从开源主仓下载 [`dsh-leaderteam-2.2.1.tgz`](https://github.com/youzi-ovo-create/dsh-leaderteam/releases/tag/v2.2.1) 并执行 `dsh plugin --profile <web|desktop> add ./dsh-leaderteam-2.2.1.tgz` 即可回退；`v2.3.0` 运行产生的 `mapping.jsonl` 会被 `v2.2.1` 安全忽略，不影响原有会话与配置读取。

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
