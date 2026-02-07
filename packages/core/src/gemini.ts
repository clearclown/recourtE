export interface GeminiMetadata {
  decision_date: string;
  court_incident_id: string;
  court_name?: string | null;
}

export interface GeminiRequestInput {
  metadata: GeminiMetadata;
  pdfBytes: Uint8Array;
  prompt: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export const buildGeminiRequest = ({ metadata, pdfBytes, prompt }: GeminiRequestInput) => {
  const base64Pdf = Buffer.from(pdfBytes).toString("base64");
  return {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            text: JSON.stringify(metadata),
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };
};

export const callGemini = async (config: GeminiConfig, requestBody: unknown) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  return response.json();
};

export const extractStructuredOutput = (response: Record<string, unknown>) => {
  if (response?.output_json) {
    return response.output_json;
  }

  const candidates = response?.candidates as Record<string, unknown>[] | undefined;
  const text = (candidates?.[0]?.content as Record<string, unknown>)?.parts as
    | Record<string, unknown>[]
    | undefined;
  const value = text?.[0]?.text;
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
