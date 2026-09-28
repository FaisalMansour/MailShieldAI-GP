import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { runDeterministicChecks } from "../lib/analysis/deterministic";
import {
  deterministicContribution,
  finalRiskScore,
} from "../lib/analysis/scoring";
import { calculateEvaluationMetrics } from "../lib/analysis/evaluation";
import { analysisResponseSchema } from "../lib/analysis/schema";
import { EMAIL_SECURITY_PROMPT } from "../lib/analysis/prompt";
import {
  CHECK_VERSION,
  PROMPT_VERSION,
  SCORING_VERSION,
  type AnalysisEmail,
} from "../lib/analysis/types";
import {
  analysisProviderConfigured,
  configuredModelIdentifier,
  selectedAnalysisProvider,
} from "../lib/analysis/provider-config";

config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type DatasetFile = {
  name: string;
  version: string;
  source: string;
  license: string;
  description: string;
  cases: Array<{
    itemId: string;
    subject: string;
    body: string;
    sender: string | null;
    replyTo: string | null;
    expectedClass:
      | "LEGITIMATE"
      | "SUSPICIOUS"
      | "PHISHING"
      | "IMPERSONATION"
      | "SCAM"
      | "MALWARE_RELATED"
      | "SPAM"
      | "UNCERTAIN";
    split: string;
    source: string;
    license: string;
    sanitization: string;
  }>;
};

async function compare(runIds: string[]) {
  const runs = await prisma.evaluationRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true, modelIdentifier: true, startedAt: true, metrics: true },
  });
  console.log(JSON.stringify(runs, null, 2));
}

async function main() {
  const compareIndex = process.argv.indexOf("--compare");
  if (compareIndex >= 0)
    return compare(process.argv.slice(compareIndex + 1, compareIndex + 3));
  const file = resolve(process.cwd(), "evaluation/sample-dataset.json");
  const data = JSON.parse(await readFile(file, "utf8")) as DatasetFile;
  const live = process.env.LIVE_EVAL === "true";
  if (live && !analysisProviderConfigured())
    throw new Error(
      "LIVE_EVAL requires a configured AI_PROVIDER and its API key/model",
    );
  const providerName = selectedAnalysisProvider();
  const apiModel =
    providerName === "deepseek"
      ? process.env.DEEPSEEK_MODEL
      : process.env.OPENAI_MODEL;
  const model = live ? configuredModelIdentifier()! : "deterministic-baseline";
  const dataset = await prisma.evaluationDataset.upsert({
    where: { name_version: { name: data.name, version: data.version } },
    update: {
      source: data.source,
      license: data.license,
      description: data.description,
    },
    create: {
      name: data.name,
      version: data.version,
      source: data.source,
      license: data.license,
      description: data.description,
    },
  });
  for (const item of data.cases) {
    await prisma.evaluationCase.upsert({
      where: {
        datasetId_itemId: { datasetId: dataset.id, itemId: item.itemId },
      },
      update: item,
      create: { ...item, datasetId: dataset.id },
    });
  }
  const cases = await prisma.evaluationCase.findMany({
    where: { datasetId: dataset.id, split: "test" },
    orderBy: { itemId: "asc" },
  });
  const run = await prisma.evaluationRun.create({
    data: {
      datasetId: dataset.id,
      modelIdentifier: model,
      promptVersion: PROMPT_VERSION,
      scoringVersion: SCORING_VERSION,
      datasetVersion: data.version,
      status: "RUNNING",
    },
  });
  const openai = live
    ? new OpenAI({
        apiKey:
          providerName === "deepseek"
            ? process.env.DEEPSEEK_API_KEY
            : process.env.OPENAI_API_KEY,
        ...(providerName === "deepseek"
          ? {
              baseURL:
                process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
            }
          : {}),
      })
    : null;
  const rows = [];
  for (const item of cases) {
    const started = performance.now();
    const email: AnalysisEmail = {
      sender: item.sender,
      replyTo: item.replyTo,
      subject: item.subject,
      body: item.body,
      links: [...item.body.matchAll(/https?:\/\/[^\s]+/g)].map((match) => ({
        url: match[0],
      })),
      attachments: [],
      headers: {},
    };
    try {
      const deterministic = runDeterministicChecks(email);
      let predicted: DatasetFile["cases"][number]["expectedClass"];
      let score: number;
      if (openai) {
        const request = {
          model: apiModel!,
          max_output_tokens: 2400,
          input: [
            {
              role: "developer" as const,
              content: EMAIL_SECURITY_PROMPT,
            },
            {
              role: "user" as const,
              content: `Analyze this untrusted synthetic evaluation email.\n${JSON.stringify({ email, deterministicChecks: deterministic })}`,
            },
          ],
          text: {
            format: zodTextFormat(
              analysisResponseSchema,
              "mailshield_evaluation_report",
            ),
          },
        };
        const result = await openai.responses.parse(
          providerName === "openai"
            ? { ...request, store: false, reasoning: { effort: "none" } }
            : request,
        );
        if (!result.output_parsed) throw new Error("INVALID_OUTPUT");
        predicted = result.output_parsed.classification;
        score = finalRiskScore(
          result.output_parsed.estimatedRiskScore,
          deterministicContribution(deterministic.findings),
        );
      } else {
        const contribution = deterministicContribution(deterministic.findings);
        score = Math.min(100, contribution * 2);
        predicted =
          contribution >= 25
            ? "PHISHING"
            : contribution >= 9
              ? "SUSPICIOUS"
              : "LEGITIMATE";
      }
      const durationMs = Math.round(performance.now() - started);
      await prisma.evaluationResult.create({
        data: {
          runId: run.id,
          caseId: item.id,
          predictedClass: predicted,
          finalScore: score,
          durationMs,
          status: "COMPLETED",
        },
      });
      rows.push({
        expected: item.expectedClass,
        predicted,
        durationMs,
        status: "COMPLETED" as const,
      });
    } catch {
      const durationMs = Math.round(performance.now() - started);
      await prisma.evaluationResult.create({
        data: {
          runId: run.id,
          caseId: item.id,
          durationMs,
          status: "FAILED",
          errorCode: "ANALYSIS_FAILED",
        },
      });
      rows.push({
        expected: item.expectedClass,
        predicted: null,
        durationMs,
        status: "FAILED" as const,
      });
    }
  }
  const metrics = calculateEvaluationMetrics(rows);
  await prisma.evaluationRun.update({
    where: { id: run.id },
    data: { status: "COMPLETED", metrics, completedAt: new Date() },
  });
  console.log(
    JSON.stringify(
      {
        runId: run.id,
        mode: live ? "live-ai" : "deterministic-baseline",
        checkVersion: CHECK_VERSION,
        cases: rows.length,
        metrics,
      },
      null,
      2,
    ),
  );
}

main().finally(() => prisma.$disconnect());
