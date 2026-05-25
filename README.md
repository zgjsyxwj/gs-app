# Pivot Desk · 数据处理工作台

一个用 **Tauri 2 + React + TypeScript + Tailwind**（shadcn 风格组件）构建的桌面工具，
通过 **Python sidecar** 处理六类财务文件任务。三平台（macOS / Windows / Linux）发布
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
│  └─ binaries/          # 三平台 sidecar 二进制（CI 注入）
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
   └─ release.yml        # 三平台 tauri-action 矩阵
```

## 6 项任务

| Code | 名称 |
|---|---|
| `MP-CN` | 微创报销数据处理 |
| `WW-AU` | 旺旺-澳大利亚报销数据处理 |
| `MP-IN` | 微创神通-印度报销文件整理 |
| `VA-PAY` | 瓦里安-Payroll 账单拆分 |
| `VA-VN-R` | 瓦里安越南-Payroll 报告处理 |
| `VA-VN-PS` | 瓦里安越南-Payslip 处理 |

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

工作流会在三个平台分别：
1. 安装 Python，运行 `sidecar/build.py` 产出对应 target-triple 的二进制
2. 安装 Node，跑 `pnpm install && pnpm build`
3. 用 `tauri-apps/tauri-action` 出 `.dmg / .msi / .AppImage / .deb`
4. 上传到一个 Draft Release

## 设计文件

`docs/design-direction-a/` 是 HTML 形式的设计稿，可直接在浏览器中查看（来自方向 A）。
