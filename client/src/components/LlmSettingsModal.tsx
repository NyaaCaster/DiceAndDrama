import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  GripVertical,
  Loader2,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { BaseModal } from "./BaseModal";
import { ApiKeyInput } from "./ApiKeyInput";
import { Field, FieldHint, ToggleSwitch } from "./SettingsFormBits";
import { LlmProviderIcon } from "./icons/providerIcons";
import {
  fetchModels,
  normalizeBaseUrl,
  ApiHttpError,
} from "../services/llm/api";
import { runHealthCheck } from "../services/llm/modelHealth";
import { getPresetMeta } from "../services/llm/providers";
import { ping, type McpHealth } from "../services/mcp/mcpApi";
import type {
  LlmSettingsSnapshot,
} from "../services/llm/storage";
import type { LlmProvider, ModelHealth } from "../services/llm/types";

/**
 * Dice & Drama 简化版 LLM 设置面板。剪掉 NyaaChat 那套：
 *   - 增删 provider：M2 阶段先不开放 custom 新建
 *   - 子模态 ManageModelsModal：合并到右栏的"刷新模型"按钮
 *
 * 顶部固定 `<McpHealthStrip>` 显示 MCP 反代是否通——M3 才有意义，
 * 在这里露脸是因为玩家通常配完 LLM 顺手就要试骰子。失败诊断：基本都是
 * `.env` 里的 `MCP_API_KEY` 没填 / 与上游不一致 → nginx 401 透传。
 *
 * 保留的最小核心：provider 切换 / enabled toggle / baseUrl 编辑
 * （只有 baseUrlEditable=true 的预设可改）/ apiKey 输入 / 模型下拉。
 */
interface LlmSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: LlmSettingsSnapshot;
  onSave: (next: LlmSettingsSnapshot) => void;
}

export function LlmSettingsModal({
  isOpen,
  onClose,
  snapshot,
  onSave,
}: LlmSettingsModalProps) {
  const providers = snapshot.llmProviders;
  const [selectedId, setSelectedId] = useState<string>(
    snapshot.currentLlmProviderId || providers[0]?.id || "",
  );

  useEffect(() => {
    if (!providers.find((p) => p.id === selectedId) && providers[0]) {
      setSelectedId(providers[0].id);
    }
  }, [providers, selectedId]);

  const selected = useMemo(
    () => providers.find((p) => p.id === selectedId),
    [providers, selectedId],
  );

  const updateProviders = (next: LlmProvider[], currentId?: string) => {
    onSave({
      llmProviders: next,
      currentLlmProviderId: currentId ?? snapshot.currentLlmProviderId,
    });
  };

  const updateProvider = (next: LlmProvider) => {
    updateProviders(providers.map((p) => (p.id === next.id ? next : p)));
  };

  const handleSelectAsCurrent = (id: string) => {
    setSelectedId(id);
    updateProviders(providers, id);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = providers.findIndex((p) => p.id === active.id);
    const newIdx = providers.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    updateProviders(arrayMove(providers, oldIdx, newIdx));
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="LLM 设置"
      titleIcon={<Cpu size={18} className="text-blue-500" />}
      maxWidth="max-w-4xl"
    >
      <McpHealthStrip />
      <div className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] min-h-[28rem]">
        <ProviderList
          providers={providers}
          selectedId={selectedId}
          currentId={snapshot.currentLlmProviderId}
          onSelect={setSelectedId}
          onSetCurrent={handleSelectAsCurrent}
          sensors={sensors}
          onDragEnd={handleDragEnd}
        />
        <div className="p-5 sm:p-6 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-white/5">
          {selected ? (
            <ProviderDetail
              provider={selected}
              onChange={updateProvider}
            />
          ) : (
            <div className="text-sm text-gray-500">未选择 Provider</div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}

function ProviderList({
  providers,
  selectedId,
  currentId,
  onSelect,
  onSetCurrent,
  sensors,
  onDragEnd,
}: {
  providers: LlmProvider[];
  selectedId: string;
  currentId: string;
  onSelect: (id: string) => void;
  onSetCurrent: (id: string) => void;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  return (
    <div className="p-3 sm:max-h-[28rem] overflow-y-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={providers.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-1 list-none">
            {providers.map((p) => (
              <SortableProviderRow
                key={p.id}
                provider={p}
                isSelected={p.id === selectedId}
                isCurrent={p.id === currentId}
                onSelect={() => onSelect(p.id)}
                onSetCurrent={() => onSetCurrent(p.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="pt-2 px-1 text-[11px] text-gray-500 dark:text-gray-400">
        单击选中编辑，双击设为"当前使用"，拖动手柄可调整顺序。
      </p>
    </div>
  );
}

function SortableProviderRow({
  provider,
  isSelected,
  isCurrent,
  onSelect,
  onSetCurrent,
}: {
  provider: LlmProvider;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  onSetCurrent: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: provider.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`flex items-center rounded-xl transition-colors ${
          isSelected
            ? "bg-blue-500/10 ring-1 ring-blue-500/40"
            : "hover:bg-gray-100 dark:hover:bg-white/5"
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`拖动 ${provider.name}`}
          className="p-2 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none flex-shrink-0"
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onSetCurrent}
          title="单击选中编辑；双击设为当前使用"
          className="flex-1 flex items-center gap-2 py-2 pr-3 text-left min-w-0"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              provider.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
            <LlmProviderIcon kind={provider.kind} size={16} />
          </span>
          <span
            className={`flex-1 truncate text-sm ${
              isSelected
                ? "text-blue-700 dark:text-blue-300 font-medium"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {provider.name}
          </span>
          {isCurrent && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 flex-shrink-0">
              当前
            </span>
          )}
        </button>
      </div>
    </li>
  );
}

function ProviderDetail({
  provider,
  onChange,
}: {
  provider: LlmProvider;
  onChange: (next: LlmProvider) => void;
}) {
  const meta = getPresetMeta(provider.kind);
  const baseUrlEditable = meta?.baseUrlEditable ?? true;
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<ModelHealth | null>(null);

  useEffect(() => {
    setHealth(null);
    setFetchError(null);
  }, [provider.id]);

  const setField = <K extends keyof LlmProvider>(
    key: K,
    value: LlmProvider[K],
  ) => {
    onChange({ ...provider, [key]: value });
  };

  const handleTestHealth = async () => {
    const modelId = provider.lastUsedModel;
    if (!modelId) return;
    setTesting(true);
    try {
      const result = await runHealthCheck(provider, modelId);
      setHealth(result);
    } finally {
      setTesting(false);
    }
  };

  const handleFetchModels = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const list = await fetchModels({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: "",
        apiFormat: provider.apiFormat,
      });
      const next = list.map((id) => ({ id }));
      // 保留旧 lastUsedModel 若仍在列表中。
      const keepLast =
        provider.lastUsedModel && list.includes(provider.lastUsedModel)
          ? provider.lastUsedModel
          : list[0] ?? "";
      onChange({
        ...provider,
        models: next,
        lastUsedModel: keepLast,
      });
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? `HTTP ${err.status}：${truncate(err.body || err.message, 200)}`
          : err instanceof Error
            ? err.message
            : "未知错误";
      setFetchError(msg);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
            <LlmProviderIcon kind={provider.kind} size={22} />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-semibold truncate">{provider.name}</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {provider.apiFormat === "anthropic"
                ? "Anthropic 原生格式"
                : "OpenAI 兼容格式"}
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={provider.enabled}
          onChange={(v) => setField("enabled", v)}
          label="启用"
        />
      </div>

      <Field label="API 地址">
        <input
          type="text"
          value={provider.baseUrl}
          onChange={(e) => setField("baseUrl", e.target.value)}
          onBlur={() => setField("baseUrl", normalizeBaseUrl(provider.baseUrl))}
          disabled={!baseUrlEditable}
          className="w-full px-4 py-3 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-[#1A1A1A] text-gray-900 dark:text-gray-100 outline-none transition-all font-mono disabled:opacity-60"
        />
        <FieldHint>
          {baseUrlEditable
            ? "本地 / 自托管端点。失焦时自动去除尾部 /chat/completions 等冗余后缀。"
            : "官方 endpoint，固定不可改。"}
        </FieldHint>
      </Field>

      <Field
        label="API Key"
        actionSlot={
          provider.kind === "qiny" && (
            <a
              href="https://openai.chatnewai.com/register?aff=btB0"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
            >
              获取 API Key
            </a>
          )
        }
      >
        <ApiKeyInput
          value={provider.apiKey}
          onChange={(v) => setField("apiKey", v)}
          placeholder={provider.kind === "ollama" ? "（本地通常留空）" : "sk-..."}
        />
        <FieldHint>
          仅存浏览器 LocalStorage，每次请求随 body 发送，服务端不持久化。
        </FieldHint>
      </Field>

      <Field
        label="模型"
        actionSlot={
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestHealth}
              disabled={testing || !provider.lastUsedModel || !provider.baseUrl}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              健康测试
            </button>
            <button
              onClick={handleFetchModels}
              disabled={fetching || !provider.baseUrl}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {fetching ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              刷新模型列表
            </button>
          </div>
        }
      >
        {provider.models.length > 0 ? (
          <select
            value={provider.lastUsedModel || ""}
            onChange={(e) => setField("lastUsedModel", e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-[#1A1A1A] text-gray-900 dark:text-gray-100 outline-none transition-all"
          >
            <option value="">— 选择模型 —</option>
            {provider.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={provider.lastUsedModel || ""}
            onChange={(e) => setField("lastUsedModel", e.target.value)}
            placeholder="先点右上角刷新，或手动填模型 id"
            className="w-full px-4 py-3 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-[#1A1A1A] text-gray-900 dark:text-gray-100 outline-none transition-all font-mono"
          />
        )}
        {fetchError && (
          <p className="text-[11px] text-red-500 mt-2 break-all">
            刷新失败：{fetchError}
          </p>
        )}
        {health && (
          <div
            className={`flex items-start gap-1.5 mt-2 text-[11px] ${
              health.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500"
            }`}
          >
            {health.ok ? (
              <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" />
            ) : (
              <XCircle size={12} className="mt-0.5 flex-shrink-0" />
            )}
            <span className="break-all">
              {health.ok
                ? `连通正常，往返 ${health.latencyMs} ms`
                : `测试失败：${health.error || "未知错误"}`}
            </span>
          </div>
        )}
        <FieldHint>
          列表为空时可直接手填模型 id；填好 Key 后建议先点"刷新模型列表"。
        </FieldHint>
      </Field>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

/**
 * MCP 健康探活条。固定显示在 LLM 设置面板顶部，方便玩家在配 LLM 之前
 * 顺手确认 MCP 反代是否通——失败的话十有八九是 .env 里 `MCP_API_KEY`
 * 没填或与上游不一致（nginx 401 透传）。打开模态时自动 ping 一次。
 */
function McpHealthStrip() {
  const [health, setHealth] = useState<McpHealth | null>(null);
  const [pinging, setPinging] = useState(false);

  const runPing = async () => {
    setPinging(true);
    try {
      setHealth(await ping());
    } finally {
      setPinging(false);
    }
  };

  useEffect(() => {
    void runPing();
  }, []);

  return (
    <div className="px-5 sm:px-6 py-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              health === null
                ? "bg-gray-400"
                : health.ok
                  ? "bg-emerald-500"
                  : "bg-red-500"
            }`}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
            MCP 反代
          </span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {pinging
              ? "探活中…"
              : health === null
                ? "尚未测试"
                : health.ok
                  ? `连通 · ${health.name ?? "MCP"}${health.version ? ` v${health.version}` : ""} · ${health.latencyMs} ms`
                  : `不可达 · ${truncate(health.error, 80)}`}
          </span>
        </div>
        <button
          type="button"
          onClick={runPing}
          disabled={pinging}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
        >
          {pinging ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          重新探活
        </button>
      </div>
    </div>
  );
}
