# pivot-sidecar

Python 处理引擎。Tauri 主进程通过子进程方式启动它，并用**逐行 JSON**通信
（详见 `pivot_sidecar/ipc.py`）。

```
# 开发态
cd sidecar
python -m venv .venv && source .venv/bin/activate
pip install -e .
python -m pivot_sidecar   # 监听 stdin / 写 stdout

# 打包（CI 在三个平台各跑一次）
pip install -e .[build]
python build.py            # 产出 dist/pivot-sidecar(.exe)
```

## 加新任务

1. 在 `pivot_sidecar/tasks/` 新建一个文件，继承 `TaskBase`，实现
   `run(input_path, output_dir, options) -> RunResult`。
2. 在 `pivot_sidecar/tasks/__init__.py` 的 `REGISTRY` 里登记一行。
3. 在前端 `src/tasks/registry.ts` 里加一条对应的描述，保证菜单一致。

任务执行过程中可以通过 `yield ProgressEvent(...)` / `yield LogEvent(...)`
推送进度和日志，会经 `ipc.py` 透传到前端。
