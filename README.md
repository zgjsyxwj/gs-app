# Pivot Desk · 数据处理工作台

一个用 **Tauri 2 + React + TypeScript + Tailwind**（shadcn 风格组件）构建的桌面工具，
通过 **Python sidecar** 处理六类财务文件任务。双平台（macOS Apple Silicon / Windows x64）发布
由 **GitHub Actions** 矩阵构建产出。

> 视觉系统：方向 A · 静谧编辑器 (Quiet Editor)，IBM Plex Sans + 深绿单点强调。
> 颜色 / 字号 / 圆角已落到 `tailwind.config.ts` 与 `src/styles/globals.css`。

## 仓库结构

```
scaffold/
├─ src/                  # 前端 React + TS
│  ├─ routes/            # Dashboard / Task / History / Settings
│  ├─ components/        # TitleBar / Sidebar
│  ├─ components/ui/     # shadcn 风格原子组件
│  ├─ tasks/registry.ts  # 6 项任务的元数据
│  ├─ lib/ipc.ts         # 与 Rust / sidecar 通信
│  └─ styles/globals.css # Tailwind + 设计 token
├─ src-tauri/            # Rust 主进程
│  ├─ src/
│  │  ├─ main.rs / lib.rs
│  │  ├─ commands.rs     # invoke_task / list_tasks / pick_file / pick_folder
│  │  └─ sidecar.rs      # 启动并守护 python sidecar
│  ├─ Cargo.toml
│  ├─ tauri.conf.json
│  ├─ capabilities/default.json
│  └─ binaries/          # 平台 sidecar 二进制（CI 注入）
├─ sidecar/              # Python 工作引擎
│  ├─ pivot_sidecar/
│  │  ├─ __main__.py     # stdio JSON-RPC 入口
│  │  ├─ server.py       # 任务调度
│  │  ├─ ipc.py          # 协议
│  │  └─ tasks/          # 6 个任务模块（占位实现）
│  ├─ pyproject.toml
│  └─ build.py           # PyInstaller 打包脚本
└─ .github/workflows/
   ├─ ci.yml             # lint / typecheck / build
   └─ release.yml        # macOS arm64 + Windows x64 tauri-action 矩阵
```

## 6 项任务

| Code                     | 名称                            |
| ------------------------ | ------------------------------- |
| `MP-CN-REIMBURSE-SUMMARY` | 微创报销总表汇总                |
| `WW-AU-EXPENSE-CLAIM`    | 旺旺澳洲 Expense Claim 整理     |
| `MP-IN-REIMBURSE-SPLIT`  | 微创神通印度报销文件分卷        |
| `VA-TW-PAYROLL-SPLIT`    | 瓦里安TW Payroll 账单拆分       |
| `VA-VN-PAYROLL-REPORT`   | 瓦里安越南 Payroll 报告加工     |
| `VA-VN-PAYSLIP-RENAME`   | 瓦里安越南 Payslip 重命名并去水印 |

每个任务在 `sidecar/pivot_sidecar/tasks/` 下一个文件，统一继承 `TaskBase`，
实现 `run(input_path, output_dir, options) -> RunResult`。

## 本地开发

```bash
# 1) 装依赖
pnpm i                                      # 前端
cd sidecar && python -m venv .venv && \
  source .venv/bin/activate && \
  pip install -e .                          # Python sidecar (开发模式)

# 2) 跑起来（一行命令）
pnpm tauri dev
```

`pnpm tauri dev` 会启动 Vite + 编译 Rust + 拉起 sidecar 二进制。
开发时 sidecar 直接调用 `python -m pivot_sidecar`；发布时调用 PyInstaller 打出来的
`pivot-sidecar-<target-triple>` 二进制（详见 `sidecar/build.py`）。

## 发布

打 tag 并 push 即触发 `.github/workflows/release.yml`：

```bash
git tag v0.1.0 && git push --tags
```

工作流会在两个平台分别：

1. 安装 Python，运行 `sidecar/build.py` 产出对应 target-triple 的二进制
2. 安装 Node，跑 `pnpm install && pnpm build`
3. 用 `tauri-apps/tauri-action` 出 `.dmg`（Apple Silicon）/ `.msi`（Windows）
4. 上传到一个 Draft Release

## 首次安装：用户会看到什么（重要）

我们目前**没有**购买 Apple Developer / Windows Authenticode 代码签名证书，
所以两个平台第一次打开都会触发系统的"未知来源"保护机制。
请在分发给用户时把下面这一段一并发过去：

### macOS（Apple Silicon）

1. 双击 `Pivot Desk_x.y.z_aarch64.dmg`，把 `Pivot Desk` 拖入 `应用程序`
2. **首次打开**：从启动台 / 应用程序文件夹**右键点击 → 选「打开」**，弹窗里再点「打开」
   - 不要用双击；双击会被 Gatekeeper 拦下，提示 "Apple cannot verify the developer of …"
3. 以后双击就能直接开

> 如果看到 **"Pivot Desk.app" is damaged and can't be opened**，是 quarantine 属性
> 异常残留导致；在终端跑一次 `xattr -cr "/Applications/Pivot Desk.app"` 就好。

### Windows (x64)

1. 双击 `Pivot Desk_x.y.z_x64-setup.exe`（或 `.msi`）
2. **首次安装**：会看到蓝色背景的 **"Windows protected your PC"** 弹窗
   - 点 **More info** → 出现 **Run anyway** 按钮 → 点它
3. 装完后从开始菜单 / 桌面打开，不会再有弹窗
4. 如果 Microsoft Defender 直接把文件隔离了，先在
   **Windows 安全中心 → 病毒和威胁防护 → 保护历史记录** 里恢复，
   然后再走步骤 2

> 这两个弹窗都是**未签名应用的正常表现**，不代表软件有问题。
> 后续如果需要无弹窗体验，需购买 Apple Developer Program（99 USD/yr）
>
> - Authenticode 代码签名证书（70~700 USD/yr）。

## 设计文件

`docs/design-direction-a/` 是 HTML 形式的设计稿，可直接在浏览器中查看（来自方向 A）。
