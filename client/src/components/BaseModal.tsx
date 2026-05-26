import React, { useEffect, useId, useRef } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

/**
 * 通用模态框外壳：ESC 关闭 / Tab 焦点循环 / body 滚动锁 / aria-labelledby。
 * 视觉上与 BlueprintM5 后续要做的像素 UI Kit 是两条平行皮 ——
 * 这里先用 NyaaChat 的现代风格起手，等 M5 像素资产就绪后再统一换皮。
 *
 * 嵌套模态：模块级 modalStack 保证 ESC 只关最上层那一个；否则一次按键
 * 会把整条嵌套链一起关掉。
 */
interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  titleIcon?: React.ReactNode;
  /** 标题与关闭按钮之间的次级控件位（如全局开关）。 */
  titleAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width，例如 "max-w-2xl"、"max-w-4xl"。 */
  maxWidth?: string;
  /** 没有可见 title 时给屏幕阅读器的备用标签。 */
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const modalStack: Array<() => void> = [];

export function BaseModal({
  isOpen,
  onClose,
  title,
  titleIcon,
  titleAction,
  children,
  footer,
  maxWidth = "max-w-lg",
  ariaLabel,
  closeOnBackdrop = true,
}: BaseModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalStack.push(onClose);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalStack[modalStack.length - 1] !== onClose) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables =
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);

    const t = setTimeout(() => {
      if (!dialogRef.current) return;
      if (dialogRef.current.contains(document.activeElement)) return;
      const target =
        dialogRef.current.querySelector<HTMLElement>("[data-autofocus]") ||
        dialogRef.current.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea',
        ) ||
        dialogRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      target?.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      const idx = modalStack.indexOf(onClose);
      if (idx >= 0) modalStack.splice(idx, 1);
      clearTimeout(t);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full ${maxWidth} bg-white/95 dark:bg-[#111111]/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-white/10 max-h-[90vh] flex flex-col overflow-hidden`}
      >
        {title && (
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {titleIcon && (
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  {titleIcon}
                </div>
              )}
              <h3
                id={titleId}
                className="text-lg font-semibold tracking-tight truncate"
              >
                {title}
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {titleAction}
              <button
                onClick={onClose}
                aria-label="关闭"
                className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
        <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && (
          <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex-shrink-0">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
