import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const systemPrompt = `You are an expert MCAT tutor. Generate exactly 3 hard MCQs. You MUST respond with valid JSON only — no markdown, no extra text.

Return this exact JSON structure:
{
  "drills": [
    {
      "passage": "optional clinical or lab scenario (can be empty string)",
      "question": "the question text",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctAnswerIndex": 0,
      "explanation": "why correct answer is right AND why each wrong answer is wrong"
    }
  ]
}`;

  const userPrompt = `Generate 3 difficult 520+ level MCAT questions targeting:
Micro-skill: "${microSkillName}" — ${microSkillDescription || ""}

Rules: Higher-order reasoning only. Clinical/lab passages. correctAnswerIndex must be 0-3. Explain why EACH wrong answer is wrong.
CRITICAL: Do NOT reference any figures, graphs, images, or tables (e.g. "Figure 1", "the graph below", "as shown"). All information needed to answer must be fully contained in the passage text and question text. No visual aids exist.`;

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
    console.error("drills error:", error);
    res.status(500).json({ error: error.message || "Drill generation failed." });
  }
}
