import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AiProvider = "gemini" | "lmstudio";

const getProvider = (): AiProvider => {
  const value = process.env.AI_PROVIDER ?? "gemini";
  if (value !== "gemini" && value !== "lmstudio") {
    throw new Error(`AI_PROVIDER の値が不正です: ${value} (gemini | lmstudio)`);
  }
  return value;
};

export const getProviderName = (): AiProvider => getProvider();

export const getAiModel = () => {
  const provider = getProvider();

  if (provider === "lmstudio") {
    const baseUrl = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
    const modelName = process.env.LMSTUDIO_MODEL || "default";

    const lmstudio = createOpenAICompatible({
      name: "lmstudio",
      baseURL: baseUrl,
    });

    return lmstudio(modelName);
  }

  return google("gemini-3-flash-preview");
};
