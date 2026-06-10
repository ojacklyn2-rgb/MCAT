import React, { useState } from 'react';
import { MicroSkill, ChatSession } from '../types';
import { Sparkles, ArrowRight, CheckCircle2, XCircle, RefreshCw, Layers, Award, FileText } from 'lucide-react';

interface PassageSet {
  passageTitle: string;
  passage: string;
  skillName: string;
  section: string;
  questions: {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
  }[];
}

interface InterleavingQuizRunnerProps {
  microSkills: MicroSkill[];
  sessions: ChatSession[];
}

const SECTION_LABELS: Record<string, string> = {
  CP: 'Chem/Phys',
  CARS: 'CARS',
  BB: 'Bio/Biochem',
  PS: 'Psych/Soc',
};

export function InterleavingQuizRunner({ microSkills, sessions }: InterleavingQuizRunnerProps) {
  const [passageSets, setPassageSets] = useState<PassageSet[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  // answers[setIdx][qIdx] = chosen index
  const [answers, setAnswers] = useState<number[][]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Filter sessions from past 7 days
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSessions = sessions.filter(s => s.createdAt >= oneWeekAgo && s.microSkill);

  // Build skill list from recent sessions, with section context
  // Each entry: { skill, section, masteryStreak }
  const recentSkillMap = new Map<string, { skill: MicroSkill; section: string }>();
  for (const s of recentSessions) {
    if (s.microSkill && !recentSkillMap.has(s.microSkill.id)) {
      recentSkillMap.set(s.microSkill.id, {
        skill: s.microSkill,
        section: s.section || 'CP',
      });
    }
  }

  // Also include microSkills updated this week (fallback if sessions don't have microSkill attached)
  for (const skill of microSkills) {
    if (!recentSkillMap.has(skill.id)) {
      // Use broadTopic to guess section if possible
      recentSkillMap.set(skill.id, { skill, section: 'CP' });
    }
  }

  // Sort: low masteryStreak first (less mastered = lower confidence), then by unresolvedCount desc
  const sortedSkills = [...recentSkillMap.values()].sort((a, b) => {
    if (a.skill.masteryStreak !== b.skill.masteryStreak) {
      return a.skill.masteryStreak - b.skill.masteryStreak;
    }
    return b.skill.unresolvedCount - a.skill.unresolvedCount;
  });

  const skillSetsForQuiz = sortedSkills.slice(0, 3);

  const handleStartQuiz = async () => {
    if (skillSetsForQuiz.length === 0) {
      setErrorMsg('Complete at least one Socratic coaching session this week to generate your weekly quiz.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setPassageSets([]);
    setCurrentSetIndex(0);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setHasChecked(false);
    setAnswers([]);
    setQuizFinished(false);

    try {
      const response = await fetch('/api/quiz/generate-interleaved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillSets: skillSetsForQuiz.map(({ skill, section }) => ({
            name: skill.name,
            description: skill.description,
            section,
          }))
        })
      });

      if (!response.ok) throw new Error('Failed to generate quiz passages.');

      const data = await response.json();
      if (data.passageSets && data.passageSets.length > 0) {
        setPassageSets(data.passageSets);
        setAnswers(data.passageSets.map((s: PassageSet) => new Array(s.questions.length).fill(-1)));
      } else {
        throw new Error('No passage sets received.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Quiz generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheck = () => {
    if (selectedOption === null || hasChecked) return;
    const updated = answers.map((row, si) =>
      si === currentSetIndex
        ? row.map((v, qi) => qi === currentQIndex ? selectedOption : v)
        : row
    );
    setAnswers(updated);
    setHasChecked(true);
  };

  const handleNext = () => {
    const set = passageSets[currentSetIndex];
    if (currentQIndex < set.questions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    } else if (currentSetIndex < passageSets.length - 1) {
      setCurrentSetIndex(currentSetIndex + 1);
      setCurrentQIndex(0);
    } else {
      setQuizFinished(true);
    }
    setSelectedOption(null);
    setHasChecked(false);
  };

  // Score computation
  const totalQuestions = passageSets.reduce((acc, s) => acc + s.questions.length, 0);
  const totalCorrect = passageSets.reduce((acc, set, si) =>
    acc + set.questions.reduce((a, q, qi) => a + (answers[si]?.[qi] === q.correctAnswerIndex ? 1 : 0), 0), 0);
  const scorePercentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const currentSet = passageSets[currentSetIndex];
  const currentQ = currentSet?.questions[currentQIndex];
  const totalQSoFar = passageSets.slice(0, currentSetIndex).reduce((a, s) => a + s.questions.length, 0) + currentQIndex + 1;
  const overallTotal = passageSets.reduce((a, s) => a + s.questions.length, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-6 text-[#37352f]" id="interleaved-lab">

      {/* Header */}
      <div className="border-b border-[#e4e4e3] pb-4" id="quiz-header">
        <h1 className="text-xl font-bold tracking-tight text-[#37352f] font-sans flex items-center gap-2">
          <Layers size={18} className="text-[#37352f]/70" />
          Weekly Interleaved Quizzes
        </h1>
        <p className="text-xs text-[#37352f]/60 font-sans mt-0.5">
          3 full passages from concepts you studied this week — prioritized by lowest mastery and confidence.
        </p>
      </div>

      {/* Start Panel */}
      {!isLoading && passageSets.length === 0 && !quizFinished && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-6 text-center space-y-5 max-w-2xl mx-auto shadow-[0_1px_3px_rgba(15,15,15,0.05)]" id="quiz-pre-setup">
          <div className="inline-flex p-3 bg-[#f7f7f5] rounded-full text-[#37352f]/70 border border-[#e4e4e3]">
            <Sparkles size={20} />
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-[#37352f] text-sm">This Week's Passage Quiz</h3>
            <p className="text-xs text-[#37352f]/60 max-w-md mx-auto leading-normal">
              3 passages targeting your lowest-confidence concepts from the past 7 days. Each passage has 4 AAMC-style reasoning questions.
            </p>
          </div>

          <div className="p-3 bg-[#f7f7f5]/80 rounded border border-[#e4e4e3] text-left text-xs space-y-1.5">
            <span className="font-bold uppercase tracking-wider text-[9px] text-[#37352f]/45 font-sans block">
              Concepts selected (lowest confidence first):
            </span>
            {skillSetsForQuiz.length === 0 ? (
              <p className="text-[#37352f]/40 italic text-xs">No concepts from this week yet. Complete a Socratic coaching session first.</p>
            ) : (
              <div className="flex flex-col gap-1.5 pt-1">
                {skillSetsForQuiz.map(({ skill, section }, i) => (
                  <div key={skill.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#37352f]/40 font-bold w-4">{i + 1}.</span>
                    <span className="px-1.5 py-0.5 bg-white border border-[#e4e4e3] font-semibold rounded text-[11px] text-[#37352f]/80">
                      {skill.name}
                    </span>
                    <span className="text-[10px] text-[#37352f]/40 font-sans">
                      {SECTION_LABELS[section] || section} · streak {skill.masteryStreak}/3
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded font-medium border border-red-200">{errorMsg}</p>
          )}

          <button
            onClick={handleStartQuiz}
            type="button"
            className="px-6 py-2 bg-[#37352f] hover:bg-[#2c2b27] text-white font-sans text-xs font-semibold rounded transition cursor-pointer w-full sm:w-auto"
          >
            Generate Weekly Quiz (3 Passages)
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-12 text-center space-y-3 max-w-2xl mx-auto">
          <RefreshCw className="animate-spin text-[#37352f] h-6 w-6 mx-auto" />
          <h3 className="font-bold text-[#37352f] text-sm font-sans">Generating 3 passages...</h3>
          <p className="text-xs text-[#37352f]/50 max-w-xs mx-auto">Building AAMC-style passages for your lowest-confidence concepts from this week.</p>
        </div>
      )}

      {/* Active Quiz */}
      {!isLoading && passageSets.length > 0 && !quizFinished && currentSet && currentQ && (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="bg-[#f7f7f5] border border-[#e4e4e3] p-3 rounded-md flex justify-between items-center text-xs">
            <div>
              <span className="text-[9px] font-bold text-[#37352f]/40 uppercase tracking-wider font-sans block">
                PASSAGE {currentSetIndex + 1} OF {passageSets.length} · {SECTION_LABELS[currentSet.section] || currentSet.section}
              </span>
              <h4 className="font-bold text-[#37352f]/80 font-sans text-xs mt-0.5">
                Question {currentQIndex + 1} of {currentSet.questions.length} &nbsp;·&nbsp; Overall {totalQSoFar}/{overallTotal}
              </h4>
            </div>
            <span className="px-1.5 py-0.5 bg-[#efeee3] border border-[#e4e4e3] text-[#37352f]/70 rounded text-[10px] font-bold font-sans">
              {currentSet.skillName}
            </span>
          </div>

          {/* Split panel */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Passage panel */}
            <div className="lg:w-[40%] bg-[#f7f7f5] border border-[#e4e4e3] rounded-md p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[8px] font-bold text-[#37352f]/40 uppercase tracking-wider font-sans">
                <FileText size={10} />
                {currentSet.passageTitle || `Passage ${currentSetIndex + 1}`}
              </div>
              <p className="text-xs leading-relaxed font-sans text-[#37352f]/80 whitespace-pre-line">
                {currentSet.passage}
              </p>
            </div>

            {/* Question panel */}
            <div className="lg:w-[60%] bg-white border border-[#e4e4e3] rounded-md p-5 space-y-4 shadow-[0_1px_3px_rgba(15,15,15,0.05)]">
              <h4 className="font-bold text-[#37352f] font-sans text-xs sm:text-sm leading-normal">
                {currentQ.question}
              </h4>

              <div className="grid grid-cols-1 gap-1.5">
                {currentQ.options.map((option, idx) => {
                  const letters = ['A', 'B', 'C', 'D'];
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === currentQ.correctAnswerIndex;

                  let optClass = "border-[#e4e4e3] bg-white hover:bg-[#f7f7f5]/45";
                  let badgeClass = "bg-[#f1f1ef] text-[#37352f]";

                  if (isSelected && !hasChecked) {
                    optClass = "border-[#37352f] bg-[#efeee3] font-semibold";
                    badgeClass = "bg-[#37352f] text-white";
                  }

                  if (hasChecked) {
                    if (isCorrect) {
                      optClass = "border-[#2ebd6e] bg-[#f0f9f4] text-[#195c36] font-bold";
                      badgeClass = "bg-[#2ebd6e] text-white";
                    } else if (isSelected) {
                      optClass = "border-red-400 bg-red-50 text-red-950";
                      badgeClass = "bg-red-500 text-white";
                    } else {
                      optClass = "border-[#e4e4e3] bg-white opacity-40";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      disabled={hasChecked}
                      onClick={() => setSelectedOption(idx)}
                      className={`w-full text-left p-2.5 border rounded flex items-start gap-2.5 transition font-sans text-xs sm:text-sm cursor-pointer ${optClass}`}
                    >
                      <span className={`h-5 w-5 rounded-sm shrink-0 flex items-center justify-center font-bold text-[10px] ${badgeClass}`}>
                        {letters[idx]}
                      </span>
                      <span className="mt-0.5 leading-snug">{option}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                {!hasChecked ? (
                  <button
                    type="button"
                    disabled={selectedOption === null}
                    onClick={handleCheck}
                    className="px-4 py-1.5 bg-[#37352f] text-white rounded font-sans text-xs font-semibold hover:bg-[#2c2b27] disabled:opacity-40 transition cursor-pointer"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-4 py-1.5 bg-[#37352f] text-white rounded font-sans text-xs font-semibold hover:bg-[#2c2b27] transition flex items-center gap-1 cursor-pointer"
                  >
                    {currentSetIndex === passageSets.length - 1 && currentQIndex === currentSet.questions.length - 1
                      ? 'Finish Quiz'
                      : currentQIndex === currentSet.questions.length - 1
                        ? 'Next Passage →'
                        : 'Next Question'
                    } <ArrowRight size={12} />
                  </button>
                )}
              </div>

              {hasChecked && (
                <div className={`p-3 rounded border text-xs font-sans space-y-1 ${
                  selectedOption === currentQ.correctAnswerIndex
                    ? 'bg-[#f0f9f4] border-[#2ebd6e]/20 text-[#195c36]'
                    : 'bg-[#fdf3f3] border-red-200/30 text-[#6a1d1d]'
                }`}>
                  <span className="font-bold flex items-center gap-1 text-[9px] uppercase tracking-wider">
                    {selectedOption === currentQ.correctAnswerIndex
                      ? <><CheckCircle2 size={12} /> Correct</>
                      : <><XCircle size={12} /> Incorrect</>
                    }
                  </span>
                  <p className="leading-relaxed text-xs text-[#37352f]/90">{currentQ.explanation}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finished */}
      {quizFinished && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-6 space-y-5 max-w-2xl mx-auto shadow-[0_1px_3px_rgba(15,15,15,0.05)] text-center">
          <div className="inline-flex p-3 bg-[#f7f7f5] border border-[#e4e4e3] text-[#37352f]/70 rounded-full">
            <Award size={28} />
          </div>

          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-[#37352f] font-sans">Weekly Quiz Complete</h2>
            <p className="text-xs text-[#37352f]/60 font-sans">{passageSets.length} passages · {totalQuestions} questions</p>
          </div>

          <div className="py-3 border-y border-[#e4e4e3] grid grid-cols-2 gap-4 max-w-xs mx-auto text-xs">
            <div className="text-center">
              <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Accuracy</span>
              <span className="text-xl font-bold text-[#37352f] block mt-0.5">{scorePercentage}%</span>
            </div>
            <div className="text-center border-l border-[#e4e4e3]">
              <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Score</span>
              <span className="text-xl font-bold text-[#37352f] block mt-0.5">{totalCorrect} <span className="text-xs text-[#37352f]/40">/ {totalQuestions}</span></span>
            </div>
          </div>

          {/* Per-passage breakdown */}
          <div className="space-y-2 text-left max-w-md mx-auto">
            <span className="font-bold text-[#37352f]/40 uppercase tracking-wider text-[9px] block font-sans">Passage Breakdown:</span>
            {passageSets.map((set, si) => {
              const correct = set.questions.reduce((a, q, qi) => a + (answers[si]?.[qi] === q.correctAnswerIndex ? 1 : 0), 0);
              const pct = Math.round((correct / set.questions.length) * 100);
              return (
                <div key={si} className="flex items-center justify-between bg-[#f7f7f5] border border-[#e4e4e3] rounded px-3 py-2 text-xs">
                  <span className="font-medium text-[#37352f]/70 truncate max-w-[60%]">{set.skillName}</span>
                  <span className={`font-bold ${pct >= 75 ? 'text-[#2ebd6e]' : pct >= 50 ? 'text-[#d97706]' : 'text-red-500'}`}>
                    {correct}/{set.questions.length} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-[#f7f7f5] border border-[#e4e4e3] rounded-md text-left text-xs max-w-md mx-auto leading-normal text-[#37352f]/70">
            {scorePercentage >= 80
              ? <p>Strong performance across all passages. Keep building your streak in Socratic sessions.</p>
              : <p>Return to Socratic coaching for any passages below 75% — revisit the concept and generate a new mastery set before the next weekly quiz.</p>
            }
          </div>

          <button
            onClick={handleStartQuiz}
            type="button"
            className="px-5 py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white text-xs font-semibold font-sans rounded transition cursor-pointer"
          >
            Generate New Weekly Quiz
          </button>
        </div>
      )}

    </div>
  );
}
