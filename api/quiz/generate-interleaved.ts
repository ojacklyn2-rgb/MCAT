import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkills } = req.body;
  if (!microSkills || !Array.isArray(microSkills) || microSkills.length === 0)
    return res.status(400).json({ error: "Provide at least one mastered micro-skill." });

  const skillsListStr = microSkills.map((s: any, i: number) =>
    `${i + 1}. "${s.name}" — ${s.description}`
  ).join("\n");

  const systemPrompt = `You are an expert MCAT tutor. Generate exactly 5 interleaved questions. You MUST respond with valid JSON only.

Return this exact JSON:
{
  "questions": [
    {
      "microSkill": "name of skill tested",
      "passage": "clinical or experimental scenario",
      "question": "the question",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctAnswerIndex": 0,
      "explanation": "why correct is right and why each wrong answer is wrong"
    }
  ]
}`;

  const userPrompt = `Generate 5 interleaved 520+ MCAT questions from:
${skillsListStr}

Never two consecutive questions from the same skill. Clinical/experimental difficulty. Return JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("quiz error:", error);
    res.status(500).json({ error: error.message || "Quiz generation failed." });
  }
}
