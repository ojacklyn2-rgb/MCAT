import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SECTION_CONTEXT: Record<string, { label: string; subjectGuidance: string; passageType: string; questionNote: string }> = {
  CP: {
    label: "Chemical and Physical Foundations of Biological Systems (C/P)",
    subjectGuidance: "Topics: general chemistry, organic chemistry, biochemistry, physics, thermodynamics, electrochemistry, kinetics, optics, fluid dynamics, acid-base, buffers, lab techniques, spectroscopy.",
    passageType: "a chemistry or physics research experiment — include specific numerical data, reaction conditions, rate constants, energy values, equilibrium expressions, or physical measurements.",
    questionNote: "Questions must combine passage data with outside chemistry/physics/biochemistry knowledge. Include unit analysis and quantitative reasoning."
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    subjectGuidance: "Topics: humanities (philosophy, ethics, art, literature, history), social sciences (sociology, anthropology, economics, political science). NO science content.",
    passageType: "a dense humanities or social science argumentative text (author's thesis, evidence, reasoning). Write in formal academic prose, NOT a research study.",
    questionNote: "Questions must test critical analysis, inference, author's argument, tone, and reasoning — NOT factual recall. Use stems like: 'The author's primary purpose is...', 'Which finding would most weaken the argument...', 'The author uses X primarily to...'."
  },
  BB: {
    label: "Biological and Biochemical Foundations of Living Systems (B/B)",
    subjectGuidance: "Topics: molecular biology, genetics, gene expression, evolution, cell biology, biochemistry, metabolism, enzyme kinetics, physiology, anatomy, microbiology.",
    passageType: "a biology or biochemistry research experiment — include specific experimental conditions, gene names, protein functions, metabolic measurements, or physiological data.",
    questionNote: "Questions must combine passage data with outside biology/biochemistry knowledge. Include pathway reasoning and molecular mechanism analysis."
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    subjectGuidance: "Topics: psychology (learning, memory, cognition, emotion, motivation, development), sociology (social structures, culture, identity, institutions), research methods, statistics, neuroscience of behavior.",
    passageType: "a psychology or sociology research study — include study design, participant demographics, measured outcomes, statistical trends, or behavioral observations.",
    questionNote: "Questions must combine passage findings with outside psychology/sociology knowledge. Test application of theory, research design critique, and social/behavioral interpretation."
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription, section = "CP" } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const ctx = SECTION_CONTEXT[section] || SECTION_CONTEXT["CP"];

  const systemPrompt = `You are an AAMC MCAT question writer for the ${ctx.label} section. Generate exactly 1 passage with 5 questions in the exact format of the real AAMC MCAT exam. You MUST respond with valid JSON only — no markdown, no extra text.

Section: ${ctx.label}
${ctx.subjectGuidance}

AAMC MCAT format rules:
1. ONE passage, 300-600 words. Written as ${ctx.passageType} NOT a clinical vignette. Be thorough — include detailed experimental setup, methods, results, and discussion so students must read carefully.
2. ALL 5 questions reference the SAME passage. The passage stays visible the entire time.
3. ${ctx.questionNote}
4. Use real AAMC question stems: "Which of the following best explains...", "The researcher would most likely conclude...", "Which finding would most support the hypothesis that...", "If the experiment were repeated with X instead of Y, the result would most likely..."
5. Wrong answer choices must be plausible — things students who partially understand the concept would choose.
6. NEVER reference any figures, graphs, images, tables, or visual aids. All information is in text only.
7. Label the passage set correctly.

Return this exact JSON:
{
  "passageTitle": "Passage 1 (Questions 1–5)",
  "passage": "full 150-250 word passage text here",
  "drills": [
    {
      "questionNumber": 1,
      "question": "AAMC-style question stem",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctAnswerIndex": 0,
      "explanation": "Why correct answer is right. Why each wrong option is wrong. Reference specific passage details."
    },
    { "questionNumber": 2 },
    { "questionNumber": 3 },
    { "questionNumber": 4 },
    { "questionNumber": 5 }
  ]
}`;

  const userPrompt = `Generate 1 passage + 5 AAMC MCAT ${ctx.label} questions targeting this micro-skill:
"${microSkillName}" — ${microSkillDescription || ""}

The passage must match the ${ctx.label} section format. Questions must require passage + outside knowledge combined. correctAnswerIndex must be 0-3. Return JSON only.`;

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
