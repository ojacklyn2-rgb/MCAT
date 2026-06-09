import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const systemPrompt = `You are an AAMC MCAT question writer. Generate exactly 1 passage with 4 questions in the exact format of the real AAMC MCAT exam. You MUST respond with valid JSON only — no markdown, no extra text.

AAMC MCAT format rules:
1. ONE passage, 150-200 words. Written like a real research study or experiment excerpt — dense, with specific numerical data, enzyme names, experimental conditions, measurements, and results. NOT a clinical case.
2. ALL 4 questions reference the SAME passage. The passage stays visible on screen the entire time.
3. Questions require combining passage information WITH outside MCAT knowledge — not one or the other alone.
4. Use real AAMC question stems: "Which of the following best explains...", "The researcher would most likely conclude...", "Which finding would most support the hypothesis that...", "If the experiment were repeated with X instead of Y, the result would most likely..."
5. Wrong answer choices must be plausible — they should be things students who partially understand the concept would choose.
6. NEVER reference any figures, graphs, images, or tables. All information is in text only.
7. Label the passage set correctly.

Return this exact JSON:
{
  "passageTitle": "Passage 1 (Questions 1–4)",
  "passage": "full 150-200 word research passage text here",
  "drills": [
    {
      "questionNumber": 1,
      "question": "AAMC-style question stem",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctAnswerIndex": 0,
      "explanation": "Why correct answer is right. Why A is wrong. Why B is wrong. Why C is wrong. Why D is wrong. Reference specific passage details."
    },
    { "questionNumber": 2, ... },
    { "questionNumber": 3, ... },
    { "questionNumber": 4, ... }
  ]
}`;

  const userPrompt = `Generate 1 passage + 4 AAMC MCAT-style questions targeting this micro-skill:
"${microSkillName}" — ${microSkillDescription || ""}

The passage must be a research/experiment excerpt with real data. Questions must require passage + outside knowledge combined. correctAnswerIndex must be 0-3. Return JSON only.`;

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
