import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const systemPrompt = `You are an AAMC MCAT question writer. Generate exactly 3 passage-based MCAT questions in the exact style of the real AAMC MCAT exam. You MUST respond with valid JSON only — no markdown, no extra text.

AAMC MCAT question style rules you MUST follow:
1. Passages are 150-200 words, written like a real journal article or research study excerpt — dense, information-rich, with specific data, enzyme names, experimental conditions, numerical values, or patient data woven in.
2. Questions do NOT test simple recall — they require the student to APPLY passage information + outside knowledge together.
3. Questions use stems like: "Which of the following best explains...", "The researcher would most likely conclude...", "Which of the following findings would most support...", "Based on the passage, if X were true, then Y would..."
4. Wrong answers are plausible and target common MCAT misconceptions — not obviously wrong.
5. NEVER reference figures, graphs, images, tables, or any visual aids. All information must be fully in text.
6. Timing context: students have ~90 seconds per question on the real MCAT.

Return this exact JSON structure:
{
  "drills": [
    {
      "passage": "dense 150-200 word research/clinical passage with specific data",
      "question": "AAMC-style question stem requiring analysis not recall",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctAnswerIndex": 0,
      "explanation": "why correct answer is right AND why each wrong answer is wrong — reference specific passage details"
    }
  ]
}`;

  const userPrompt = `Generate 3 AAMC MCAT-style passage-based questions targeting:
Micro-skill: "${microSkillName}" — ${microSkillDescription || ""}

Each passage must read like a real MCAT research excerpt. Questions must require analysis, not recall. correctAnswerIndex must be 0-3. Explain why EACH wrong answer is wrong, referencing both passage details and outside knowledge.`;

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
