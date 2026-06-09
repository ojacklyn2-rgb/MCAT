import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function parseBase64Image(dataUrl: string) {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  return { mimeType: matches[1], data: matches[2] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, image } = req.body;
  if (!text && !image) return res.status(400).json({ error: "Either wrong question text or screenshot is required." });

  const systemPrompt = `You are an expert MCAT tutor building 520+ scorers. You MUST respond with valid JSON only — no markdown, no extra text.

When analyzing a student's wrong answer, return this exact JSON structure:
{
  "microSkillName": "specific 6-7 word micro-skill name",
  "microSkillDescription": "what the micro-skill is and why students struggle",
  "broadTopic": "MCAT section - Topic (e.g. Chemistry/Physics - Electrochemistry)",
  "conceptSummary": "plain language explanation with analogy, then layered complexity",
  "socraticOpener": "first Socratic question to probe their understanding - do NOT reveal the answer"
}`;

  const userPrompt = `The student got this wrong: "${text || "See image context"}"

Identify the MCAT section, the exact micro-skill gap (not the broad topic), why they likely missed it, and open a Socratic dialogue. Return valid JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("intake error:", error);
    res.status(500).json({ error: error.message || "Intake analysis failed." });
  }
}
