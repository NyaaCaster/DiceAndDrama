import OpenAI from "@lobehub/icons/es/OpenAI";
import Anthropic from "@lobehub/icons/es/Anthropic";
import Gemini from "@lobehub/icons/es/Gemini";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Ollama from "@lobehub/icons/es/Ollama";
import { QinyIcon } from "./QinyIcon";
import { CustomProviderIcon } from "./CustomProviderIcon";
import type { LlmProviderKind } from "../../services/llm/types";

interface IconProps {
  size?: number;
  kind: LlmProviderKind;
}

/**
 * 给定 LlmProviderKind，渲染对应品牌图标。
 *
 * - QinyAPI 没有上游官方包提供，用项目内的 QinyIcon
 * - custom 端点（用户自填 baseUrl）用 CustomProviderIcon —— 一个聊天气泡，
 *   与 lucide-react 的扳手 / 设置图标视觉上区分开
 * - 其他 5 家从 @lobehub/icons 走 deep-import（`/es/<Brand>`）单独引入，
 *   esbuild 只 bundle 实际用到的 SVG，不会拉整个包
 */
export function LlmProviderIcon({ kind, size = 18 }: IconProps) {
  switch (kind) {
    case "qiny":
      return <QinyIcon size={size} />;
    case "gemini":
      return <Gemini.Color size={size} />;
    case "anthropic":
      return <Anthropic size={size} color="#D97757" />;
    case "openai":
      return <OpenAI size={size} />;
    case "deepseek":
      return <DeepSeek.Color size={size} />;
    case "ollama":
      return <Ollama size={size} />;
    case "custom":
      return <CustomProviderIcon size={size} />;
  }
}
