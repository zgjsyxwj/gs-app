import { cn } from "@/lib/utils";

/**
 * 字段右侧的"选择/更改"按钮，白底 + 1px ink-10 描边、accent 文字，hover 时
 * 背景换 accent-soft、边框换 accent。
 *
 * - variant="path"  → 文本"选择" + 文件夹图标，用于路径字段（来源/输出）
 * - variant="plain" → 文本"更改"，无图标，用于非路径字段
 */
type PickerButtonProps = {
  onClick?: () => void;
  variant?: "path" | "plain";
  disabled?: boolean;
  className?: string;
};

export function PickerButton({
  onClick,
  variant = "plain",
  disabled,
  className,
}: PickerButtonProps) {
  const isPath = variant === "path";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex flex-none items-center gap-[5px] rounded-[5px] border border-ink-10 bg-card",
        "pl-2 pr-[9px] py-[5px] text-[11px] font-medium leading-none text-accent",
        "transition-colors duration-[120ms] hover:border-accent hover:bg-accent-soft",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink-10 disabled:hover:bg-card",
        className,
      )}
    >
      {isPath && <PickerFolderIcon />}
      <span>{isPath ? "选择" : "更改"}</span>
    </button>
  );
}

function PickerFolderIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.6 4a1 1 0 011-1H6l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1H2.6a1 1 0 01-1-1V4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
