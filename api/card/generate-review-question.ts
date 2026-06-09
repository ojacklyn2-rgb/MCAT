import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill." });

  const systemPrompt = `You are an expert MCAT tutor. Generate 1 spaced-repetition question. You MUST respond with valid JSON only.

Return this exact JSON:
{
  "passage": "clinical or lab scenario (~150 words)",
  "question": "the question",
  "options": ["A. option", "B. option", "C. option", "D. option"],
  "correctAnswerIndex": 0,
  "explanation": "why correct is right and why each wrong answer is wrong"
}`;

  const userPrompt = `Generate a 520+ MCAT review question for: "${microSkillName}" — ${microSkillDescription || ""}
Test from a different angle than standard practice. Return JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("review error:", error);
    res.status(500).json({ error: error.message || "Review question failed." });
  }
}
