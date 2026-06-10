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

  const { microSkillName, microSkillDescription, conceptSummary, originalMistake, section = "CP" } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const ctx = SECTION_CONTEXT[section] || SECTION_CONTEXT["CP"];

  const systemPrompt = `You are an expert AAMC MCAT question writer for the ${ctx.label} section. Respond with valid JSON only — no markdown, no extra text.

SECTION: ${ctx.label}

═══════════════════════════════════
STEP 1: WRITE THE PASSAGE (300–600 words)
═══════════════════════════════════
${ctx.passageInstructions}

The passage MUST be 300–600 words. Write at least 4 full paragraphs. This is mandatory — do not write a short passage.

═══════════════════════════════════
STEP 2: WRITE 5 AAMC-QUALITY QUESTIONS
═══════════════════════════════════
${ctx.questionInstructions}

STRICT RULES FOR EVERY QUESTION:
1. NEVER ask a basic recall or definition question. Wrong examples: "What is X?", "Which of the following defines X?", "What does X mean?"
2. Every question MUST require the student to combine information from the passage WITH outside MCAT knowledge to arrive at the answer. Neither alone is sufficient.
3. Every question must involve REASONING — applying a concept, predicting an outcome, explaining a mechanism, identifying an implication, or evaluating evidence.
4. Approved AAMC stems: "Which of the following best explains why...", "The researcher would most likely conclude that...", "Based on the passage, which outcome would most likely result if...", "Which of the following findings would most support the hypothesis that...", "The author's use of X most likely serves to...", "If the experiment were repeated under condition Y, the results would most likely..."
5. Answer choices must be plausible to a student who has partial understanding — no obviously wrong distractors.
6. NEVER reference figures, graphs, tables, images, or visual aids. Text only.
7. correctAnswerIndex must be 0, 1, 2, or 3.

═══════════════════════════════════
JSON OUTPUT FORMAT
═══════════════════════════════════
{
  "passageTitle": "Passage 1 (Questions 1–5)",
  "passage": "Full 300-600 word passage text here across 4-6 paragraphs...",
  "drills": [
    { "questionNumber": 1, "question": "AAMC-style reasoning question", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "Why correct answer is right AND why each wrong answer is wrong, referencing specific passage details." },
    { "questionNumber": 2, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 1, "explanation": "..." },
    { "questionNumber": 3, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 2, "explanation": "..." },
    { "questionNumber": 4, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 3, "explanation": "..." },
    { "questionNumber": 5, "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "..." }
  ]
}`;

  const userPrompt = `Write a ${ctx.label} passage and 5 questions targeting this specific concept gap:

MICRO-SKILL: "${microSkillName}"
DESCRIPTION: ${microSkillDescription || ""}
${conceptSummary ? `\nCONCEPT THE STUDENT JUST LEARNED:\n${conceptSummary}` : ""}
${originalMistake ? `\nORIGINAL MISTAKE THE STUDENT MADE:\n${originalMistake}` : ""}

The passage and questions MUST directly test the concept described above. The passage scenario should be a novel application of that same concept so the student must transfer their understanding to a new context — not just repeat what they saw before.

REMINDER: Passage must be 300–600 words. Return valid JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4096,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("drills error:", error);
    res.status(500).json({ error: error.message || "Drill generation failed." });
  }
}
