import React from "react";

interface CustomProviderIconProps {
  size?: number;
  className?: string;
}

/**
 * "custom" 自定义 LLM 端点的图标 —— 蓝色聊天气泡 + 三个白点。
 * gradient id 接 useId 后缀避免多实例冲突（同 QinyIcon 思路）。
 */
export function CustomProviderIcon({ size = 18, className }: CustomProviderIconProps) {
  const reactId = React.useId();
  const gradientId = `custom-bubble-${reactId.replace(/:/g, "")}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="3"
          x2="0"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <path
        d="M5 4 H19 A3 3 0 0 1 22 7 V14 A3 3 0 0 1 19 17 H10 L6.5 20.5 V17 H5 A3 3 0 0 1 2 14 V7 A3 3 0 0 1 5 4 Z"
        fill={`url(#${gradientId})`}
      />
      <circle cx="8" cy="10.5" r="1.3" fill="#FFFFFF" />
      <circle cx="12" cy="10.5" r="1.3" fill="#FFFFFF" />
      <circle cx="16" cy="10.5" r="1.3" fill="#FFFFFF" />
    </svg>
  );
}
