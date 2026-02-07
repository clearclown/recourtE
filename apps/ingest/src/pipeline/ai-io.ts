import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { putR2Object } from "@recourt/core";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { PDFParse } from "pdf-parse";

import type { IngestConfig } from "../load-config.js";
import { structuredOutputSchema } from "../schema.js";
import { getAiModel, getProviderName } from "./ai-provider.js";

export type AiMetadata = {
  decision_date: string;
  court_incident_id: string;
  court_name: string | null;
};

export const buildAiRequestPayload = (input: {
  prompt: string;
  metadata: AiMetadata;
  pdfBytes: Uint8Array;
  model: string;
}) => {
  return {
    model: input.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          {
            type: "file",
            data: Buffer.from(input.pdfBytes).toString("base64"),
            mimeType: "application/pdf",
          },
          { type: "text", text: JSON.stringify(input.metadata) },
        ],
      },
    ],
  };
};

export const storeAiRequest = async (
  r2Client: ReturnType<typeof import("@recourt/core").createR2Client>,
  bucket: string,
  key: string,
  payload: unknown,
) => {
  await putR2Object(r2Client, bucket, key, JSON.stringify(payload), "application/json");
};

export const storeAiResponse = async (
  r2Client: ReturnType<typeof import("@recourt/core").createR2Client>,
  bucket: string,
  key: string,
  payload: unknown,
) => {
  await putR2Object(r2Client, bucket, key, JSON.stringify(payload), "application/json");
};

export const storeAiOutput = async (
  r2Client: ReturnType<typeof import("@recourt/core").createR2Client>,
  bucket: string,
  key: string,
  payload: unknown,
) => {
  await putR2Object(r2Client, bucket, key, JSON.stringify(payload), "application/json");
};

// PDFからテキストを抽出する（LM Studio用）
const extractPdfText = async (pdfBytes: Uint8Array): Promise<string> => {
  const pdf = new PDFParse({ data: pdfBytes });
  const result = await pdf.getText();
  return result.text;
};

// JSONテキストからオブジェクトをパースし、Zodでバリデーションするフォールバック
const parseJsonFallback = (text: string) => {
  // ```json ... ``` ブロックがあれば中身を抽出
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const parsed = JSON.parse(raw);
  return structuredOutputSchema.parse(parsed);
};

export const callAi = async (input: {
  config: IngestConfig;
  pdfBytes: Uint8Array;
  metadata: AiMetadata;
}) => {
  const provider = getProviderName();
  const model = getAiModel();

  if (provider === "lmstudio") {
    const pdfText = await extractPdfText(input.pdfBytes);
    console.log(`[ai] PDF テキスト抽出完了 (${pdfText.length} 文字)`);

    // 構造化出力を試行
    try {
      const result = await generateText({
        model,
        output: Output.object({
          schema: structuredOutputSchema,
        }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.config.gemini.prompt },
              { type: "text", text: `--- PDF本文 ---\n${pdfText}` },
              { type: "text", text: JSON.stringify(input.metadata) },
            ],
          },
        ],
      });

      if (result.output) {
        return result;
      }
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        console.log("[ai] 構造化出力失敗、JSONパースフォールバックを試行");
        const parsed = parseJsonFallback(error.text);
        return {
          output: parsed,
          text: error.text,
          usage: error.usage,
          warnings: [],
          response: error.response,
          finishReason: error.finishReason,
        };
      }
      throw error;
    }

    // Output.object が null を返した場合のフォールバック: テキスト生成 → JSONパース
    console.log("[ai] 構造化出力が null、テキスト生成フォールバックを試行");
    const textResult = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.config.gemini.prompt },
            { type: "text", text: `--- PDF本文 ---\n${pdfText}` },
            { type: "text", text: JSON.stringify(input.metadata) },
          ],
        },
      ],
    });

    const parsed = parseJsonFallback(textResult.text);
    return {
      output: parsed,
      text: textResult.text,
      usage: textResult.usage,
      warnings: textResult.warnings,
      response: textResult.response,
      finishReason: textResult.finishReason,
    };
  }

  // Gemini プロバイダ（既存ロジック）
  try {
    return generateText({
      model,
      output: Output.object({
        schema: structuredOutputSchema,
      }),
      providerOptions: {
        google: {
          structuredOutputs: true,
          thinkingConfig: {
            thinkingLevel: "low",
            includeThoughts: true,
          },
        } satisfies GoogleGenerativeAIProviderOptions,
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.config.gemini.prompt },
            {
              type: "file",
              data: input.pdfBytes,
              mediaType: "application/pdf",
            },
            { type: "text", text: JSON.stringify(input.metadata) },
          ],
        },
      ],
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.log("NoObjectGeneratedError");
      console.log("Cause:", error.cause);
      console.log("Text:", error.text);
      console.log("Response:", error.response);
      console.log("Usage:", error.usage);
      console.log("Finish Reason:", error.finishReason);
    }
    throw error;
  }
};
