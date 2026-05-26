import React from "react";

interface QinyIconProps {
  size?: number;
  className?: string;
}

/**
 * QinyAPI 品牌标 —— 橙色渐变云朵剪影。
 * 多个 gradient id 后缀都接 useId，避免同页面多实例时第二个挂载找到
 * 第一个已 detach 的 id 而渲染成无填充。
 *
 * SVG 源自 Keeper_CoC-TRPG，三段渐变 + 高光层比 NyaaChat 那版更精细。
 */
export function QinyIcon({ size = 18, className }: QinyIconProps) {
  const reactId = React.useId();
  const safe = reactId.replace(/:/g, "");
  const fillId = `qiny-fill-${safe}`;
  const shadeId = `qiny-shade-${safe}`;
  const hiId = `qiny-hi-${safe}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      role="img"
      aria-label="QinyAPI"
      className={className}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="32" x2="0" y2="208" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB870" />
          <stop offset=".55" stopColor="#FF9A3C" />
          <stop offset="1" stopColor="#EF6A11" />
        </linearGradient>
        <linearGradient id={shadeId} x1="0" y1="120" x2="0" y2="208" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7A2E00" stopOpacity="0" />
          <stop offset="1" stopColor="#7A2E00" stopOpacity=".22" />
        </linearGradient>
        <radialGradient
          id={hiId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(116 78) rotate(28) scale(46 14)"
        >
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".85" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g fill={`url(#${fillId})`}>
        <circle cx="84" cy="148" r="50" />
        <circle cx="132" cy="100" r="56" />
        <circle cx="178" cy="138" r="46" />
        <ellipse cx="132" cy="168" rx="82" ry="44" />
      </g>

      <ellipse cx="132" cy="168" rx="82" ry="44" fill={`url(#${shadeId})`} />
      <ellipse cx="116" cy="78" rx="46" ry="14" fill={`url(#${hiId})`} />
    </svg>
  );
}
