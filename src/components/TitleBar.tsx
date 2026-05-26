import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

function Dot({ color, onClick }: { color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-3 w-3 rounded-full border border-black/10"
      style={{ background: color }}
      aria-label="window control"
    />
  );
}

/**
 * Custom frameless title bar — drag region across the whole strip, with three
 * macOS-style traffic lights on the left. On Windows / Linux the same controls
 * call Tauri's minimize / maximize / close.
 */
export default function TitleBar() {
  const win = (() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  })();

  return (
    <div
      data-tauri-drag-region
      className="flex h-[38px] flex-shrink-0 select-none items-center border-b border-rule bg-bg"
    >
      <div className="flex gap-2 px-3.5" data-tauri-drag-region={false}>
        <Dot color="#D9534F" onClick={() => win?.close()} />
        <Dot color="#E6A23C" onClick={() => win?.minimize()} />
        <Dot color="#67B26F" onClick={() => win?.toggleMaximize()} />
      </div>
      <div
        className={cn(
          "flex-1 text-center text-[12px] tracking-[0.2px] text-ink-50",
          "pointer-events-none"
        )}
      >
        <span className="font-semibold text-ink">Pivot Desk</span>
        <span className="mx-2 text-ink-30">·</span>
        <span>数据处理工作台</span>
      </div>
      <div className="w-[90px]" />
    </div>
  );
}
