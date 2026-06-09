import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SECTION_CONTEXT: Record<string, { label: string; passageLabel: string; passageInstructions: string; questionInstructions: string }> = {
  CP: {
    label: "Chemical and Physical Foundations (C/P)",
    passageLabel: "Research Passage",
    passageInstructions: `Write a detailed chemistry or physics research experiment passage. Cover all of these in separate paragraphs:
Paragraph 1 (background, ~80 words): Introduce the scientific concept and why it matters.
Paragraph 2 (context, ~80 words): Prior research or theoretical framework relevant to the experiment.
Paragraph 3 (methods, ~90 words): Detailed experimental setup — specific reagents, concentrations, temperatures, instruments used.
Paragraph 4 (results, ~90 words): Quantitative findings — numerical data, rates, measurements, observations.
Paragraph 5 (analysis, ~80 words): Interpretation of the results, what they mean mechanistically.
Paragraph 6 (conclusion, ~70 words): Broader implications or next steps.
Topics allowed: general chemistry, organic chemistry, biochemistry, thermodynamics, electrochemistry, acid-base, kinetics, optics, fluid dynamics, spectroscopy.
PROHIBITED: clinical patient cases, diagnosis, treatment, symptoms.`,
    questionInstructions: `Questions must combine passage data with outside MCAT chemistry/physics knowledge. Include quantitative reasoning. Use stems: "Which of the following best explains...", "The researcher would most likely conclude...", "If X were changed to Y, the result would most likely be..."`
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    passageLabel: "CARS Passage",
    passageInstructions: `Write a CARS humanities or social science argumentative essay. Cover all of these in separate paragraphs:
Paragraph 1 (thesis, ~80 words): The author's central argument or claim.
Paragraph 2 (context, ~80 words): Historical, cultural, or intellectual background supporting the argument.
Paragraph 3 (evidence 1, ~90 words): First supporting point with examples or evidence.
Paragraph 4 (evidence 2, ~90 words): Second supporting point, possibly acknowledging a counterargument.
Paragraph 5 (counterargument response, ~80 words): Author rebutting opposing views.
Paragraph 6 (conclusion, ~70 words): Restatement of thesis and broader significance.
Topics allowed: philosophy, ethics, history, art criticism, literature, cultural studies, sociology, economics, political theory.
STRICTLY PROHIBITED: Any science, medicine, biology, chemistry, physics, clinical content. ZERO science.`,
    questionInstructions: `Questions must test ONLY critical analysis — never science knowledge. Use CARS stems: "The author's primary purpose is...", "Which most undermines the author's argument?", "The author mentions X primarily to...", "Based on the passage, the author would most likely agree that...", "The central claim is best described as..."`
  },
  BB: {
    label: "Biological and Biochemical Foundations (B/B)",
    passageLabel: "Research Passage",
    passageInstructions: `Write a detailed biology or biochemistry research experiment passage. Cover all of these in separate paragraphs:
Paragraph 1 (background, ~80 words): Introduce the biological or biochemical concept and its significance.
Paragraph 2 (context, ~80 words): Prior research, known pathways, or relevant molecular context.
Paragraph 3 (methods, ~90 words): Experimental design — specific genes, proteins, cell lines, conditions, assays used.
Paragraph 4 (results, ~90 words): Quantitative or qualitative findings — expression levels, activity, phenotypes.
Paragraph 5 (analysis, ~80 words): Mechanistic interpretation of results.
Paragraph 6 (conclusion, ~70 words): Broader biological implications.
Topics allowed: molecular biology, genetics, gene expression, cell signaling, metabolism, enzyme kinetics, physiology, evolution, microbiology.
PROHIBITED: clinical patient cases, diagnosis, drug treatment plans.`,
    questionInstructions: `Questions must combine passage findings with outside MCAT biology/biochemistry knowledge. Include pathway reasoning. Use stems: "Which of the following best explains...", "The researcher would most likely conclude...", "Which finding would most support the hypothesis that..."`
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    passageLabel: "Study Passage",
    passageInstructions: `Write a detailed psychology or sociology research study passage. Cover all of these in separate paragraphs:
Paragraph 1 (background, ~80 words): Introduce the psychological or sociological concept and theoretical context.
Paragraph 2 (context, ~80 words): Prior research and theoretical frameworks relevant to the study.
Paragraph 3 (methods, ~90 words): Study design — participant demographics, conditions, variables measured, procedures.
Paragraph 4 (results, ~90 words): Specific quantitative or qualitative findings with data.
Paragraph 5 (analysis, ~80 words): Interpretation using psychological or sociological theory.
Paragraph 6 (conclusion, ~70 words): Broader implications for behavior or society.
Topics allowed: learning, memory, cognition, emotion, motivation, development, social behavior, identity, culture, institutions, research methods, statistics, neuroscience of behavior.`,
    questionInstructions: `Questions must combine passage findings with outside MCAT psychology/sociology knowledge. Use stems: "Based on the passage, the researcher would most likely conclude...", "Which theoretical framework best explains...", "The results suggest that..."`
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription, section = "CP" } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const ctx = SECTION_CONTEXT[section] || SECTION_CONTEXT["CP"];

  const systemPrompt = `You are an AAMC MCAT question writer for the ${ctx.label} section. Respond with valid JSON only — no markdown, no extra text.

SECTION: ${ctx.label}

=== PASSAGE (WRITE THIS FIRST) ===
${ctx.passageInstructions}

CRITICAL PASSAGE LENGTH RULE: The passage MUST be 300–600 words total. Write 4–6 full paragraphs. Do not stop early — a passage under 300 words is too short. The same passage is shown to the student for ALL 5 questions, so it must contain enough detail to support 5 different questions.

=== 5 QUESTIONS ===
${ctx.questionInstructions}
- All 5 questions must reference the same passage
- Distractors must be plausible to students who partially understand the concept
- NEVER mention figures, graphs, images, tables, or visual aids
- correctAnswerIndex must be 0, 1, 2, or 3

=== JSON OUTPUT ===
{
  "passageTitle": "Passage 1 (Questions 1–5)",
  "passage": "[4-6 paragraphs, 300-600 words — same passage for all 5 questions]",
  "drills": [
    { "questionNumber": 1, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "Why correct. Why A wrong. Why B wrong. Why C wrong. Why D wrong." },
    { "questionNumber": 2, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 1, "explanation": "..." },
    { "questionNumber": 3, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 2, "explanation": "..." },
    { "questionNumber": 4, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 3, "explanation": "..." },
    { "questionNumber": 5, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "..." }
  ]
}`;

  const userPrompt = `Write a ${ctx.label} passage and 5 questions for this micro-skill:
"${microSkillName}" — ${microSkillDescription || ""}

REMINDER: The passage must be 300–600 words across 4-6 paragraphs. Return valid JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4000,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("drills error:", error);
    res.status(500).json({ error: error.message || "Drill generation failed." });
  }
}
