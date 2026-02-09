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

// LLM出力の型をスキーマに合わせて正規化する
// biome-ignore lint/suspicious/noExplicitAny: LLM出力の型は不定
const normalizeAiOutput = (obj: any, metadata?: AiMetadata) => {
  // outcome がネストされたオブジェクトの場合（プロンプトが outcome.main_text と指示するため）
  if (obj.outcome && typeof obj.outcome === "object" && !obj.main_text) {
    obj.main_text = obj.outcome.main_text ?? obj.outcome.text ?? "";
  }
  // main_text がまだ未設定で outcome が文字列の場合
  if (!obj.main_text && typeof obj.outcome === "string") {
    obj.main_text = obj.outcome;
  }
  // main_text のデフォルト
  if (!obj.main_text) {
    obj.main_text = "";
  }

  // メタデータから不足フィールドを補完
  if (metadata) {
    if (!obj.decision_date) obj.decision_date = metadata.decision_date;
    if (!obj.court_incident_id) obj.court_incident_id = metadata.court_incident_id;
    if (!obj.court_name) obj.court_name = metadata.court_name ?? "";
  }

  // スキーマで string なフィールドが配列で返された場合、改行結合
  for (const key of [
    "impact",
    "summary",
    "background",
    "what_we_learned",
    "main_text",
    "case_title_short",
    "court_name",
    "court_incident_id",
    "decision_date",
    "reasoning_markdown",
  ]) {
    if (Array.isArray(obj[key])) {
      obj[key] = obj[key].join("\n");
    }
  }
  // スキーマで配列なフィールドが文字列で返された場合、配列化
  for (const key of ["issues", "reasoning", "impacted_parties"]) {
    if (typeof obj[key] === "string") {
      obj[key] = [obj[key]];
    }
  }
  // judges 配列内の各オブジェクトを正規化
  if (Array.isArray(obj.judges)) {
    for (const judge of obj.judges) {
      // name → judge_name のフィールド名マッピング
      if (!judge.judge_name && judge.name) judge.judge_name = judge.name;
      // judge_id がない場合は judge_name をフォールバック
      if (!judge.judge_id) judge.judge_id = judge.judge_name ?? "unknown";
      // judge_id が数値の場合は文字列化
      if (typeof judge.judge_id === "number") judge.judge_id = String(judge.judge_id);
      // supplementary_opinion のデフォルト（nullable だが undefined は不可）
      if (judge.supplementary_opinion === undefined) judge.supplementary_opinion = null;
      if (judge.opinion_summary === undefined) judge.opinion_summary = null;
      // 意見フィールドが配列の場合
      for (const key of ["supplementary_opinion", "opinion_summary"]) {
        if (Array.isArray(judge[key])) {
          judge[key] = judge[key].join("\n");
        }
      }
    }
  }
  return obj;
};

// JSONテキストからオブジェクトをパースし、Zodでバリデーションするフォールバック
const parseJsonFallback = (text: string, metadata?: AiMetadata) => {
  // ```json ... ``` ブロックがあれば中身を抽出
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const parsed = JSON.parse(raw);
  const normalized = normalizeAiOutput(parsed, metadata);
  const result = structuredOutputSchema.safeParse(normalized);
  if (result.success) {
    return result.data;
  }
  // バリデーション失敗時にキーを特定できるようログ出力
  const paths = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  console.log(`[ai] Zod バリデーションエラー: ${paths.join(", ")}`);
  console.log(`[ai] LLM出力のキー: ${Object.keys(parsed).join(", ")}`);
  throw result.error;
};

export const callAi = async (input: {
  config: IngestConfig;
  pdfBytes: Uint8Array;
  metadata: AiMetadata;
}) => {
  const provider = getProviderName();
  const model = getAiModel();

  // Gemini以外: PDFバイナリ直接送信不可、テキスト抽出してから送信
  if (provider !== "gemini") {
    let pdfText = await extractPdfText(input.pdfBytes);
    console.log(`[ai] PDF テキスト抽出完了 (${pdfText.length} 文字)`);

    // ローカルLLM: コンテキスト長の制限に合わせてPDFテキストを切り詰め
    // ctx 8192 - プロンプト ~1000tok - メタ ~100tok - 出力 ~4000tok = PDF ~3000tok ≈ 4000文字
    const LOCAL_PDF_MAX_CHARS = Number(process.env.LOCAL_PDF_MAX_CHARS) || 4000;
    if (provider === "local" && pdfText.length > LOCAL_PDF_MAX_CHARS) {
      // 先頭部分（事案の概要）と末尾部分（主文・結論）を保持
      const headChars = Math.floor(LOCAL_PDF_MAX_CHARS * 0.7);
      const tailChars = LOCAL_PDF_MAX_CHARS - headChars;
      pdfText = `${pdfText.slice(0, headChars)}\n\n[...中略 (${pdfText.length - LOCAL_PDF_MAX_CHARS}文字省略)...]\n\n${pdfText.slice(-tailChars)}`;
      console.log(`[ai] ローカルLLM: PDFテキストを${LOCAL_PDF_MAX_CHARS}文字に切り詰め`);
    }

    const textMessages = [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: input.config.prompt },
          { type: "text" as const, text: `--- PDF本文 ---\n${pdfText}` },
          { type: "text" as const, text: JSON.stringify(input.metadata) },
        ],
      },
    ];

    // ローカルLLM / DeepSeek: 構造化出力 (json_schema) 非対応・互換モードが不安定なため、テキスト生成 → JSONパース
    if (provider === "local" || provider === "deepseek") {
      const label = provider === "local" ? "ローカルLLM" : "DeepSeek";
      console.log(`[ai] ${label}: テキスト生成 → JSONパースモード`);
      const maxTokens = Number(process.env.LOCAL_MAX_TOKENS) || 4096;
      const textResult = await generateText({
        model,
        messages: textMessages,
        ...(provider === "local" ? { maxOutputTokens: maxTokens } : {}),
      });

      const parsed = parseJsonFallback(textResult.text, input.metadata);
      return {
        output: parsed,
        text: textResult.text,
        usage: textResult.usage,
        warnings: textResult.warnings,
        response: textResult.response,
        finishReason: textResult.finishReason,
      };
    }

    // クラウドAPI (OpenAI, Claude, Grok): 構造化出力を試行
    try {
      const result = await generateText({
        model,
        output: Output.object({
          schema: structuredOutputSchema,
        }),
        messages: textMessages,
      });

      if (result.output) {
        return result;
      }
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        console.log("[ai] 構造化出力失敗、JSONパースフォールバックを試行");
        const parsed = parseJsonFallback(error.text, input.metadata);
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
      messages: textMessages,
    });

    const parsed = parseJsonFallback(textResult.text, input.metadata);
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
            { type: "text", text: input.config.prompt },
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
