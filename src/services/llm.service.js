import OpenAI from "openai";
import { z } from "zod";

// The LLM must return exactly this shape. Anything else is treated as a
// failed match job rather than trusted and stored — this is the
// "validation" half of the LLM integration concept.
export const MatchResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.string().min(1).max(280),
  strengths: z.array(z.string().min(1)).max(6),
  gaps: z.array(z.string().min(1)).max(6),
});

function buildClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and add it to .env"
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
  });
}

function extractJson(text) {
  // Strip ```json ... ``` fences if the model wraps its answer in one.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

function estimateCostUsd(promptTokens, completionTokens) {
  const ratePer1k = Number(process.env.LLM_COST_PER_1K_TOKENS || 0);
  return ((promptTokens + completionTokens) / 1000) * ratePer1k;
}

/**
 * Scores a resume against a job description with the LLM.
 * Returns { score, verdict, strengths, gaps, model, promptTokens, completionTokens, costUsd }
 * or throws if the model, provider, or response validation fails.
 */
export async function scoreMatch(resumeText, jobDescription) {
  const client = buildClient();
  const model = process.env.LLM_MODEL || "llama-3.1-8b-instant";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a strict technical recruiter. Compare the candidate's resume against the job " +
          "description and respond with ONLY a JSON object, no prose, no markdown fences, matching " +
          'exactly this shape: {"score": <integer 0-100>, "verdict": <one sentence>, ' +
          '"strengths": [<up to 6 short phrases>], "gaps": [<up to 6 short phrases>]}.',
      },
      {
        role: "user",
        content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`,
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content ?? "";
  let parsedJson;
  try {
    parsedJson = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("LLM did not return valid JSON");
  }

  const result = MatchResultSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`LLM response failed validation: ${result.error.message}`);
  }

  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;

  return {
    ...result.data,
    model,
    promptTokens,
    completionTokens,
    costUsd: estimateCostUsd(promptTokens, completionTokens),
  };
}
