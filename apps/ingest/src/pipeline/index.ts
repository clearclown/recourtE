import { createR2Client } from "@recourt/core";
import {
  ai_outputs,
  cases,
  createDatabase,
  type NewAiOutput,
  runMigrations,
} from "@recourt/database";
import { eq } from "drizzle-orm";

import type { IngestConfig } from "../load-config.js";
import {
  type AiMetadata,
  buildAiRequestPayload,
  callAi,
  storeAiOutput,
  storeAiRequest,
  storeAiResponse,
} from "./ai-io.js";
import { getAiModel, getProviderName } from "./ai-provider.js";
import { findDuplicateCase, reuseExistingAiOutputIfPossible } from "./duplicate-handler.js";
import { claimJob, loadPendingJobs, markJob } from "./job-runner.js";
import { normalizeStructuredOutput } from "./output-normalizer.js";
import { buildPdfKey, computePdfHash, fetchPdfBytes, storePdfToR2 } from "./pdf-io.js";

export const ingestPendingJobs = async (config: IngestConfig) => {
  const db = createDatabase({
    url: config.turso.url,
    authToken: config.turso.authToken,
  });
  await runMigrations(db);

  const r2Config = config.r2;
  const r2Client = r2Config ? createR2Client(r2Config) : null;

  if (!r2Config || !r2Client) {
    console.log("[ingest] R2未設定: ストレージ操作をスキップします");
  }

  const pendingJobs = await loadPendingJobs(db);
  const model = getAiModel();
  const providerName = getProviderName();

  console.log(`[ingest] pending jobs: ${pendingJobs.length}`);
  console.log(`[ingest] AI プロバイダ: ${providerName}, モデル: ${model.modelId}`);

  for (const job of pendingJobs) {
    const startedAt = new Date().toISOString();
    console.log(
      `[ingest] start job=${job.ingest_job_id} case=${job.case_id} incident=${job.court_incident_id} date=${job.decision_date}`,
    );
    const claimed = await claimJob(db, job, startedAt);
    if (!claimed) {
      console.log(`[ingest] skip job=${job.ingest_job_id} (already claimed)`);
      continue;
    }

    try {
      console.log(`[ingest] fetch pdf: ${job.pdf_url}`);
      const pdfBytes = await fetchPdfBytes(job.pdf_url);
      const pdfHash = computePdfHash(pdfBytes);
      console.log(`[ingest] pdf fetched bytes=${pdfBytes.length} hash=${pdfHash}`);
      const duplicate = await findDuplicateCase(db, pdfHash, job.case_id);

      if (duplicate) {
        console.log(`[ingest] duplicate pdf detected case=${duplicate.case_id}`);
        if (r2Client && r2Config) {
          const reused = await reuseExistingAiOutputIfPossible({
            db,
            r2Client,
            config,
            caseId: job.case_id,
            pdfHash,
            startedAt,
            duplicateCaseId: duplicate.case_id,
          });
          if (reused) {
            await markJob(db, job, "done");
            continue;
          }
        }
      }

      if (r2Client && r2Config) {
        const pdfKey = buildPdfKey(job);
        console.log(`[ingest] upload pdf to r2 key=${pdfKey}`);
        await storePdfToR2(r2Client, r2Config.bucket, pdfKey, pdfBytes);
      }

      await db.update(cases).set({ pdf_hash: pdfHash }).where(eq(cases.case_id, job.case_id)).run();

      const metadata: AiMetadata = {
        decision_date: job.decision_date,
        court_incident_id: job.court_incident_id,
        court_name: job.court_name ?? null,
      };

      const requestKey = `requests/${job.case_id}/${startedAt}.json`;
      const responseKey = `responses/${job.case_id}/${startedAt}.json`;
      const outputKey = `outputs/${job.case_id}/${startedAt}.json`;

      if (r2Client && r2Config) {
        const requestPayload = buildAiRequestPayload({
          prompt: config.prompt,
          metadata,
          pdfBytes,
          model: model.modelId,
        });
        console.log(`[ingest] store ai request key=${requestKey}`);
        await storeAiRequest(r2Client, r2Config.bucket, requestKey, requestPayload);
      }

      console.log(`[ingest] call ${providerName} model=${model.modelId}`);
      const aiResult = await callAi({ config, pdfBytes, metadata });

      const aiResultJsonData = aiResult.output;

      if (r2Client && r2Config) {
        const responsePayload = {
          text: aiResultJsonData,
          usage: aiResult.usage,
          warnings: aiResult.warnings,
          response: aiResult.response,
        };
        console.log(`[ingest] store ai response key=${responseKey}`);
        await storeAiResponse(r2Client, r2Config.bucket, responseKey, responsePayload);

        console.log(`[ingest] store ai output key=${outputKey}`);
        await storeAiOutput(r2Client, r2Config.bucket, outputKey, aiResultJsonData);
      }

      const aiOutputRow: NewAiOutput = {
        case_id: job.case_id,
        output_r2_key: outputKey,
        request_r2_key: requestKey,
        response_r2_key: responseKey,
        created_at: startedAt,
      };
      await db.insert(ai_outputs).values(aiOutputRow).run();

      console.log(`[ingest] normalize output case=${job.case_id}`);
      await normalizeStructuredOutput(db, job.case_id, aiResultJsonData);

      await markJob(db, job, "done");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markJob(db, job, "error", message);
    }
  }
};
