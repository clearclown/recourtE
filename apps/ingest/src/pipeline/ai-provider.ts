import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { Agent, fetch as undiciFetch } from "undici";

/** 対応AIプロバイダー */
export type AiProvider = "gemini" | "claude" | "openai" | "deepseek" | "grok" | "local";

const AI_PROVIDERS: readonly AiProvider[] = [
  "gemini",
  "claude",
  "openai",
  "deepseek",
  "grok",
  "local",
];

/** デフォルトモデル名 */
const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash-preview-05-20",
  claude: "claude-sonnet-4-5-20250929",
  openai: "gpt-4.1",
  deepseek: "deepseek-chat",
  grok: "grok-3",
  local: "default",
};

const getProvider = (): AiProvider => {
  const value = process.env.AI_PROVIDER ?? "gemini";
  if (!AI_PROVIDERS.includes(value as AiProvider)) {
    throw new Error(`AI_PROVIDER の値が不正です: ${value} (${AI_PROVIDERS.join(" | ")})`);
  }
  return value as AiProvider;
};

export const getProviderName = (): AiProvider => getProvider();

/** 環境変数から、またはデフォルトのモデル名を取得 */
const getModelName = (provider: AiProvider): string => {
  return process.env.AI_MODEL || DEFAULT_MODELS[provider];
};

/** AI SDKのモデルインスタンスを生成 */
export const getAiModel = () => {
  const provider = getProvider();
  const model = getModelName(provider);

  switch (provider) {
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
      });
      return google(model);
    }
    case "claude": {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      });
      return anthropic(model);
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY ?? "",
      });
      return openai(model);
    }
    case "deepseek": {
      const deepseek = createDeepSeek({
        apiKey: process.env.DEEPSEEK_API_KEY ?? "",
      });
      return deepseek(model);
    }
    case "grok": {
      const xai = createXai({
        apiKey: process.env.XAI_API_KEY ?? "",
      });
      return xai(model);
    }
    case "local": {
      const baseUrl = process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:1234/v1";
      // ローカルLLMは応答が遅いため、undici でタイムアウトを延長（デフォルト10分）
      const timeoutMs = Number(process.env.LOCAL_LLM_TIMEOUT_MS) || 600_000;
      const dispatcher = new Agent({
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
        connectTimeout: 30_000,
      });
      const local = createOpenAICompatible({
        name: "local-llm",
        baseURL: baseUrl,
        fetch: async (url, init) => {
          return undiciFetch(url, { ...init, dispatcher }) as unknown as Response;
        },
      });
      return local(model);
    }
  }
};
