import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SECTION_CTX: Record<string, { label: string; passageInstructions: string; questionInstructions: string }> = {
  CP: {
    label: "Chemical and Physical Foundations (C/P)",
    passageInstructions: `Write a chemistry or physics research experiment passage (300–500 words, 4–5 paragraphs).
P1 (~80w): Introduce the scientific concept and why it matters.
P2 (~80w): Prior research or theoretical framework.
P3 (~90w): Experimental setup — specific reagents, concentrations, instruments.
P4 (~90w): Quantitative findings — numerical data, measurements, observations.
P5 (~80w): Mechanistic interpretation and broader implications.
Topics: general chemistry, organic chemistry, biochemistry, thermodynamics, electrochemistry, acid-base, kinetics, optics, fluid dynamics.
PROHIBITED: clinical patient cases, diagnosis, treatment.`,
    questionInstructions: `Use AAMC stems: "Which of the following best explains why...", "The researcher would most likely conclude...", "If X were changed to Y, the result would most likely be...". Combine passage data with outside MCAT chemistry/physics knowledge. Include quantitative reasoning.`
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    passageInstructions: `Write a CARS humanities or social science argumentative essay (300–500 words, 4–5 paragraphs).
P1 (~80w): The author's central argument or claim.
P2 (~80w): Historical, cultural, or intellectual background.
P3 (~90w): First supporting point with examples or evidence.
P4 (~90w): Second point, possibly acknowledging a counterargument.
P5 (~80w): Author rebuttal and restatement of thesis.
Topics: philosophy, ethics, history, art criticism, literature, cultural studies, sociology, economics, political theory.
STRICTLY PROHIBITED: Any science, medicine, biology, chemistry, physics. ZERO science content.`,
    questionInstructions: `Use CARS stems: "The author's primary purpose is...", "Which most undermines the author's argument?", "The author mentions X primarily to...", "Based on the passage, the author would most likely agree that...". Test only critical analysis — never science knowledge.`
  },
  BB: {
    label: "Biological and Biochemical Foundations (B/B)",
    passageInstructions: `Write a biology or biochemistry research passage (300–500 words, 4–5 paragraphs).
P1 (~80w): Introduce the biological or biochemical concept and its significance.
P2 (~80w): Prior research, known pathways, or molecular context.
P3 (~90w): Experimental design — specific genes, proteins, cell lines, assays.
P4 (~90w): Findings — expression levels, activity, phenotypes.
P5 (~80w): Mechanistic interpretation and broader biological implications.
Topics: molecular biology, genetics, cell signaling, metabolism, enzyme kinetics, physiology, evolution, microbiology.
PROHIBITED: clinical drug treatment plans.`,
    questionInstructions: `Use stems: "Which of the following best explains...", "The researcher would most likely conclude...", "Which finding would most support the hypothesis that...". Combine passage findings with outside MCAT biology/biochemistry knowledge.`
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    passageInstructions: `Write a psychology or sociology research study passage (300–500 words, 4–5 paragraphs).
P1 (~80w): Introduce the psychological or sociological concept.
P2 (~80w): Prior research and theoretical frameworks.
P3 (~90w): Study design — participant demographics, variables, procedures.
P4 (~90w): Findings with data.
P5 (~80w): Interpretation and broader implications.
Topics: learning, memory, cognition, emotion, motivation, development, social behavior, identity, culture, institutions, research methods.`,
    questionInstructions: `Use stems: "Based on the passage, the researcher would most likely conclude...", "Which theoretical framework best explains...", "The results suggest that...". Combine passage findings with outside MCAT psychology/sociology knowledge.`
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { skillSets } = req.body;
  if (!skillSets || !Array.isArray(skillSets) || skillSets.length === 0)
    return res.status(400).json({ error: "Provide at least one skill set." });

  const setsToGenerate = skillSets.slice(0, 3);

  const results = await Promise.all(setsToGenerate.map(async (skill: { name: string; description: string; section: string }, i: number) => {
    const section = skill.section || "CP";
    const ctx = SECTION_CTX[section] || SECTION_CTX["CP"];

    const systemPrompt = `You are an expert AAMC MCAT question writer for the ${ctx.label} section. Respond with valid JSON only — no markdown.

PASSAGE INSTRUCTIONS:
${ctx.passageInstructions}

QUESTION INSTRUCTIONS (write exactly 4 questions):
${ctx.questionInstructions}

STRICT RULES:
1. NEVER ask basic recall ("What is X?", "Which defines X?").
2. Every question MUST combine passage content with outside MCAT knowledge.
3. Every question requires reasoning: applying, predicting, explaining, evaluating.
4. Answer choices must be plausible for a student with partial understanding.
5. NEVER reference figures, graphs, tables, or images.
6. correctAnswerIndex must be 0, 1, 2, or 3.

JSON FORMAT:
{
  "passageTitle": "Passage ${i + 1} (Questions ${i * 4 + 1}–${i * 4 + 4})",
  "passage": "Full 300-500 word passage...",
  "skillName": "${skill.name}",
  "section": "${section}",
  "questions": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "Why correct is right AND why each wrong answer is wrong." },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 1, "explanation": "..." },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 2, "explanation": "..." },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 3, "explanation": "..." }
  ]
}`;

    const userPrompt = `Write a ${ctx.label} passage and 4 AAMC-quality questions targeting:

MICRO-SKILL: "${skill.name}"
DESCRIPTION: ${skill.description || ""}

The passage must be a novel application of this concept — not a repeat. Return valid JSON only.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000,
    });

    return JSON.parse(completion.choices[0].message.content || "{}");
  }));

  res.json({ passageSets: results });
}
