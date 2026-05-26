import { defineConfig } from "vitest/config";

/**
 * Dice & Drama 前端测试配置。
 *
 * M4 阶段所有用例都是纯字符串解析（parseSceneBlocks / dmSystemPrompt），
 * 不需要 jsdom、不需要 React TestUtils。后续 M6/M8 真要测组件时再装
 * @testing-library/react + jsdom 环境。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
