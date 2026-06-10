import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SECTION_CONTEXT: Record<string, { label: string; passageInstructions: string; questionInstructions: string }> = {
  CP: {
    label: "Chemical and Physical Foundations (C/P)",
    passageInstructions: `Write a detailed chemistry or physics research experiment passage (300–500 words, 4–6 paragraphs).
Paragraph 1 (~80 words): Introduce the scientific concept and why it matters.
Paragraph 2 (~80 words): Prior research or theoretical framework relevant to the experiment.
Paragraph 3 (~90 words): Detailed experimental setup — specific reagents, concentrations, temperatures, instruments used.
Paragraph 4 (~90 words): Quantitative findings — numerical data, rates, measurements, observations.
Paragraph 5 (~80 words): Interpretation of the results and mechanistic explanation.
Topics: general chemistry, organic chemistry, biochemistry, thermodynamics, electrochemistry, acid-base, kinetics, optics, fluid dynamics, spectroscopy.
PROHIBITED: clinical patient cases, diagnosis, treatment, symptoms.`,
    questionInstructions: `Use approved AAMC stems: "Which of the following best explains why...", "The researcher would most likely conclude...", "If X were changed to Y, the result would most likely be...". Combine passage data with outside MCAT chemistry/physics knowledge. Include quantitative reasoning.`
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    passageInstructions: `Write a CARS humanities or social science argumentative essay (300–500 words, 4–6 paragraphs).
Paragraph 1 (~80 words): The author's central argument or claim.
Paragraph 2 (~80 words): Historical, cultural, or intellectual background supporting the argument.
Paragraph 3 (~90 words): First supporting point with examples or evidence.
Paragraph 4 (~90 words): Second supporting point, possibly acknowledging a counterargument.
Paragraph 5 (~80 words): Author rebutting opposing views and restating thesis.
Topics: philosophy, ethics, history, art criticism, literature, cultural studies, sociology, economics, political theory.
STRICTLY PROHIBITED: Any science, medicine, biology, chemistry, physics, clinical content. ZERO science.`,
    questionInstructions: `Use CARS stems: "The author's primary purpose is...", "Which most undermines the author's argument?", "The author mentions X primarily to...", "Based on the passage, the author would most likely agree that...". Test only critical analysis — never science knowledge.`
  },
  BB: {
    label: "Biological and Biochemical Foundations (B/B)",
    passageInstructions: `Write a detailed biology or biochemistry research experiment passage (300–500 words, 4–6 paragraphs).
Paragraph 1 (~80 words): Introduce the biological or biochemical concept and its significance.
Paragraph 2 (~80 words): Prior research, known pathways, or relevant molecular context.
Paragraph 3 (~90 words): Experimental design — specific genes, proteins, cell lines, conditions, assays used.
Paragraph 4 (~90 words): Quantitative or qualitative findings — expression levels, activity, phenotypes.
Paragraph 5 (~80 words): Mechanistic interpretation of results and broader biological implications.
Topics: molecular biology, genetics, gene expression, cell signaling, metabolism, enzyme kinetics, physiology, evolution, microbiology.
PROHIBITED: clinical patient cases, diagnosis, drug treatment plans.`,
    questionInstructions: `Use stems: "Which of the following best explains...", "The researcher would most likely conclude...", "Which finding would most support the hypothesis that...". Combine passage findings with outside MCAT biology/biochemistry knowledge. Include pathway reasoning.`
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    passageInstructions: `Write a detailed psychology or sociology research study passage (300–500 words, 4–6 paragraphs).
Paragraph 1 (~80 words): Introduce the psychological or sociological concept and theoretical context.
Paragraph 2 (~80 words): Prior research and theoretical frameworks relevant to the study.
Paragraph 3 (~90 words): Study design — participant demographics, conditions, variables measured, procedures.
Paragraph 4 (~90 words): Specific quantitative or qualitative findings with data.
Paragraph 5 (~80 words): Interpretation using psychological or sociological theory and broader implications.
Topics: learning, memory, cognition, emotion, motivation, development, social behavior, identity, culture, institutions, research methods, statistics, neuroscience of behavior.`,
    questionInstructions: `Use stems: "Based on the passage, the researcher would most likely conclude...", "Which theoretical framework best explains...", "The results suggest that...". Combine passage findings with outside MCAT psychology/sociology knowledge.`
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { skillSets } = req.body;
  if (!skillSets || !Array.isArray(skillSets) || skillSets.length === 0)
    return res.status(400).json({ error: "Provide at least one skill set." });

  // Generate one passage set per skill (up to 3)
  const setsToGenerate = skillSets.slice(0, 3);

  const results = await Promise.all(setsToGenerate.map(async (skill: { name: string; description: string; section: string }, i: number) => {
    const section = skill.section || "CP";
    const ctx = SECTION_CONTEXT[section] || SECTION_CONTEXT["CP"];

    const systemPrompt = `You are an expert AAMC MCAT question writer for the ${ctx.label} section. Respond with valid JSON only — no markdown, no extra text.

PASSAGE INSTRUCTIONS:
${ctx.passageInstructions}

QUESTION INSTRUCTIONS (write exactly 4 questions):
${ctx.questionInstructions}

STRICT RULES:
1. NEVER ask basic recall or definition questions ("What is X?", "Which defines X?").
2. Every question MUST combine passage content with outside MCAT knowledge — neither alone is sufficient.
3. Every question must require reasoning: applying a concept, predicting an outcome, explaining a mechanism.
4. Answer choices must be plausible for a student with partial understanding — no obviously wrong distractors.
5. NEVER reference figures, graphs, tables, or visual aids. Text only.
6. correctAnswerIndex must be 0, 1, 2, or 3.

JSON FORMAT:
{
  "passageTitle": "Passage ${i + 1} (Questions ${i * 4 + 1}–${i * 4 + 4})",
  "passage": "Full 300-500 word passage here...",
  "skillName": "${skill.name}",
  "section": "${section}",
  "questions": [
    { "question": "AAMC-style reasoning question", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "Why correct is right AND why each wrong answer is wrong." },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 1, "explanation": "..." },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 2, "explanation": "..." },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 3, "explanation": "..." }
  ]
}`;

    const userPrompt = `Write a ${ctx.label} passage and 4 AAMC-quality questions targeting this concept:

MICRO-SKILL: "${skill.name}"
DESCRIPTION: ${skill.description || ""}

The passage and questions MUST directly test this concept. The passage should be a novel application so the student must transfer their understanding to a new context.

REMINDER: Passage must be 300–500 words. Return valid JSON only.`;

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
