# 官方 Desktop 部署、恢复与日常维护

本仓库适配官方 **DeepSeek Harness Desktop `0.2.2-rc.1`**。Node.js 运行要求：LeaderTeam 核心插件要求 `>= 22.15`；若需自行构建随仓 `extensions/dsh-context`，要求 `^22.19.0 || >= 24.0.0`（建议统一使用 Node.js `22.19+` 或 `24.x`）。

本机安装与数据目录统一由未入库的 `config/official-desktop.paths.json` 指定（首次使用时从 `config/official-desktop.paths.example.json` 复制并填写本机绝对路径），本机模型路由、额度快照与全局参考目录由可选的 `config/leaderteam.local.json` 覆盖。**注意**：随仓 `config/leaderteam.config.json` 中的 `codex/`、`zcode/` 等模型路由为示例网关配置，部署后请通过 `leaderteam.local.json`、`scripts/configure-models.mjs` 或 DSH 侧栏 **LeaderTeam 控制台**修改为自己网关实际提供的模型路由。

## 部署顺序

1. 将 `config/official-desktop.paths.example.json` 复制为 `config/official-desktop.paths.json`，设置 `app`、`home`、`userData`、`workspace` 四个绝对路径（`home` 与 `userData` 须分属独立本地目录，且祖先不含目录联接/符号链接或 EFS 加密）。
2. 如需使用脚本校验并静默安装官方 `0.2.2-rc.1` 安装包，执行：
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deployment\install-official-app.ps1 -Installer '<官方0.2.2-rc.1安装包.exe>' -Execute
   ```
   若官方客户端已安装到 `app` 指向的位置，可跳过此步。
3. 运行一次 `.\scripts\start-official-desktop.ps1` 完成官方 Desktop 首次初始化生成 `profiles\desktop`，然后完全退出（含系统托盘）。
4. 安装 LeaderTeam 受管预设与本地 Magpie provider：
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-desktop.ps1 -DryRun
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-desktop.ps1
   ```
5. 可选创建桌面快捷方式 **DeepSeek Harness - LeaderTeam**：
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deployment\create-official-shortcut.ps1
   ```

日常双击 **DeepSeek Harness - LeaderTeam**（或运行 `.\scripts\start-official-desktop.ps1`）。该入口仅为应用子进程设置 `DSH_HOME` 与本地 Magpie 公开占位变量 `LEADERTEAM_MAGPIE_KEY=magpie-local`，显式传入 `--user-data-dir`，不修改全局环境变量。新建会话选择 **LeaderTeam** 预设及 `roles.leader` 配置的模型，再指定要处理的项目工作区。

## 停用与恢复

完全退出官方 Desktop 后，执行 `.\scripts\uninstall-desktop.ps1` 即可移除 `profiles\desktop\cordis.patch.yml` 中受管理的 LeaderTeam 配置段并恢复官方原生 `tool-executor-native`；原配置备份保存在 `backups\desktop-profile-<时间戳>\`。卸载不会删除已有会话、团队记录或工作区成果。

LeaderTeam 插件通过本仓库的 `file://` URL 加载，移动仓库目录后须重新执行一次 `.\scripts\install-desktop.ps1` 更新受管路径。

## 新项目目录：代码+命令行成员的权限检查

DSH 的 Windows 沙箱要在工作区上设置受限写入权限；只有普通“修改”权限的目录里，`pwsh` 会在启动前失败（成员自动收起命令工具并报告 blocked，不会越权执行）。在一个新项目目录第一次派“代码+命令行”成员前：

1. 新建 LeaderTeam 会话，让领队派一个 shell 档位成员只运行 `Get-Location`。成功即可正常使用。
2. 若报 Windows 文件权限错误，退出该会话，确认目标目录无误后运行随附的沙箱权限诊断修复工具（只给当前用户补齐该目录及其上级缺少的完全控制，并移除冲突的应用包权限项；文件内容与所有者不变；每项改动均输出备份和回滚命令）：

```powershell
& '.\tools\dsh-sandbox-acl\scripts\diagnose-windows-sandbox-acl.ps1' -Path '<项目目录>' -AllowRoot '<项目目录>' -Out '<项目目录的上级>\acl-recovery-<项目名>'
```

然后重做第 1 步。修复失败时按输出的 ROLLBACK 命令恢复并停止，不要手工改权限。

## 暂存发布与回滚（可选工作流）

在暂存目录完成验证后，可使用 `scripts\dev\promote-stage.mjs` 按 SHA-256 清单原子替换并生成回滚备份：

```powershell
node .\scripts\dev\promote-stage.mjs --stage <暂存目录> --live . --manifest <暂存目录>\promotion-manifest.json            # 预览，不改文件
node .\scripts\dev\promote-stage.mjs --stage <暂存目录> --live . --manifest <暂存目录>\promotion-manifest.json --execute  # 发布
node .\scripts\dev\promote-stage.mjs --live . --rollback backups\pre-promotion-<时间戳> --execute                         # 回滚
```

## 强制更新已装上（复验之前）

新版本核心不在已验证列表时，LeaderTeam 拒绝启动，不会无安全门运行。处理：

1. 完全退出 DeepSeek Harness。用新安装包运行 `.\scripts\verify-desktop-update.ps1`（见《官方Desktop更新复验》），通过自动场景与窗口验收后，将新版本号加入 `leaderteam/package.json` 的 `supportedCoreVersions` 与 `scripts/dsh-runtime.mjs`。
2. 需要立即继续使用普通 DSH 会话：运行 `.\scripts\uninstall-desktop.ps1` 移除受管理的 LeaderTeam 配置段（恢复官方原生执行器），待新版本完成适配验收后再运行 `.\scripts\install-desktop.ps1` 重新启用。
