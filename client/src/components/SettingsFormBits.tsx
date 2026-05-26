import { useId } from "react";

/**
 * 设置面板共用的小型表单原语：标签 + 内容 + hint + toggle。
 * 不绑定具体字段语义，方便未来 ImageProvidersModal、McpHealthModal 等
 * 直接复用同一套视觉。
 */

export function Field({
  label,
  children,
  actionSlot,
}: {
  label: string;
  children: React.ReactNode;
  /** 标签右侧的次级控件位（如"获取 API Key"链接）。 */
  actionSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 min-h-[1.25rem]">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </label>
        {actionSlot}
      </div>
      {children}
    </div>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
      {children}
    </p>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleSwitchProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
      title={label}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <span className="relative inline-flex items-center">
        <input
          id={id}
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></span>
      </span>
    </label>
  );
}
