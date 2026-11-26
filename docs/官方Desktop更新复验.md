# 官方 Desktop 更新复验

对下载好的 DeepSeek 官方 Windows 安装包运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-desktop-update.ps1 -Installer 'D:\Downloads\dsh-latest-windows-x64.exe'
```

也可以检查已解包目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-desktop-update.ps1 -CandidateApp 'D:\Candidate\DeepSeek-Harness'
```

默认自动创建 `scratch/update-qualification/run-<时间>-<随机值>`。可用 `-WorkDir` 指定该根下的新目录；已存在的目录、越界目录和带链接/EFS 的祖先会被拒绝。保留失败记录和全部测试夹具，不覆盖上次结果。

工具校验 DeepSeek 有效签名并记录 SHA256，用本机安装的 7-Zip（或通过 `-SevenZip <7z.exe>` 指定的路径）解出候选程序，不运行安装器。随后核实真实包元数据、版本一致性、pipeline 指纹与两个 CLI 执行入口。执行主体有变化时返回需适配；符合当前精确指纹的候选进入自动测试。

自动测试使用独立副本、私有 home 和脚本模型，运行全部 28 个集成场景及 23 项官方 CLI 配置实载检查。副本完整复制 `scripts` 与所需测试/插件；原始文件和复验工具自身记录开始/结束哈希。未知版本只在副本临时准入，不修改正式白名单、不调用真实模型、不升级或打开正式窗口。

输出目录中包括：

| 文件 | 内容 |
| --- | --- |
| `result.json` | 签名、候选身份、完整场景结果、原文件完整性与结论 |
| `verification.log` | 解包、检查、复制、集成测试的完整日志 |
| `report.md` | 可读结果；其中耗时为 Node 检查与测试阶段，解包及签名时间另见日志时间戳 |
| `staging-manifest.json` | 复制的文件哈希和副本版本调整 |
| `signature.json`、`extraction.json` | 签名记录、来源及解包位置（对应输入模式） |

`result.json` 记录复验工具自身三个文件的 SHA256（开始与结束各一次，运行中被改动即判失败）。退出 0 且 `automatedPassed=true` 才算自动检查通过。零退出但缺场景、部分通过、指纹变化等均不能算通过。合法输出目录创建后发生的失败写入 `result.json`；输出路径本身非法时返回错误且不写入该路径。

`needsNativeQualification=true` 表示本工具没有代做候选的真实模型及原生窗口验收。自动检查通过后完成对应验收，再决定正式支持版本与升级。当前已交付的官方版环境继续使用既有桌面快捷方式。
