import React, { useState, useRef, useEffect } from 'react';
import { MicroSkill, ChatSession } from '../types';
import {
  Sparkles, ArrowRight, CheckCircle2, XCircle, RefreshCw,
  Layers, Award, FileText, Send, AlertTriangle, RotateCcw
} from 'lucide-react';

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

interface TutorMsg { role: 'user' | 'ai'; text: string; }

interface InterleavingQuizRunnerProps {
  microSkills: MicroSkill[];
  sessions: ChatSession[];
  onUpdateMicroSkill: (skill: MicroSkill) => void;
}

const SECTION_LABELS: Record<string, string> = {
  CP: 'Chem/Phys', CARS: 'CARS', BB: 'Bio/Biochem', PS: 'Psych/Soc',
};

const CONF_COLORS = {
  low:    'border-red-400    bg-red-50    text-red-700',
  medium: 'border-[#d97706] bg-[#fffbeb] text-[#92400e]',
  high:   'border-[#2ebd6e] bg-[#f0f9f4] text-[#166534]',
};
const CONF_ACTIVE = {
  low:    'bg-red-500    text-white border-red-500',
  medium: 'bg-[#d97706] text-white border-[#d97706]',
  high:   'bg-[#2ebd6e] text-white border-[#2ebd6e]',
};

export function InterleavingQuizRunner({ microSkills, sessions, onUpdateMicroSkill }: InterleavingQuizRunnerProps) {
  const [passageSets, setPassageSets]       = useState<PassageSet[]>([]);
  const [currentSetIdx, setCurrentSetIdx]   = useState(0);
  const [currentQIdx, setCurrentQIdx]       = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasChecked, setHasChecked]         = useState(false);

  // answers[setIdx][qIdx] = chosen option index
  const [answers, setAnswers]         = useState<number[][]>([]);
  // confidence[setIdx][qIdx] = 'low'|'medium'|'high'
  const [confidenceMap, setConfidence] = useState<('low'|'medium'|'high'|null)[][]>([]);
  const [confidence, setConf]          = useState<'low'|'medium'|'high'|null>(null);

  // Per-question AI tutor chat
  const [tutorChats, setTutorChats]     = useState<TutorMsg[][][]>([]); // [setIdx][qIdx][]
  const [tutorInput, setTutorInput]     = useState('');
  const [isTutorLoading, setTutorLoad]  = useState(false);

  const [quizFinished, setQuizFinished] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [tutorChats]);

  // ── SKILL SELECTION ─────────────────────────────────────
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Build skill map from recent sessions (past 7 days)
  const recentSkillMap = new Map<string, { skill: MicroSkill; section: string }>();
  for (const s of sessions) {
    if (s.createdAt >= oneWeekAgo && s.microSkill) {
      if (!recentSkillMap.has(s.microSkill.id)) {
        recentSkillMap.set(s.microSkill.id, { skill: s.microSkill, section: s.section || 'CP' });
      }
    }
  }
  // Fallback: all microSkills if none from this week
  if (recentSkillMap.size === 0) {
    for (const skill of microSkills) {
      recentSkillMap.set(skill.id, { skill, section: 'CP' });
    }
  }

  // Sort: lowest masteryStreak first, then highest unresolvedCount
  const sortedSkills = [...recentSkillMap.values()].sort((a, b) =>
    a.skill.masteryStreak !== b.skill.masteryStreak
      ? a.skill.masteryStreak - b.skill.masteryStreak
      : b.skill.unresolvedCount - a.skill.unresolvedCount
  );
  const skillSetsForQuiz = sortedSkills.slice(0, 3);

  // ── START QUIZ ───────────────────────────────────────────
  const handleStartQuiz = async () => {
    if (skillSetsForQuiz.length === 0) {
      setErrorMsg('Complete at least one Socratic coaching session to generate your weekly quiz.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setPassageSets([]);
    setCurrentSetIdx(0);
    setCurrentQIdx(0);
    setSelectedOption(null);
    setHasChecked(false);
    setAnswers([]);
    setConfidence([]);
    setConf(null);
    setTutorChats([]);
    setTutorInput('');
    setQuizFinished(false);

    try {
      const res = await fetch('/api/quiz/generate-interleaved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillSets: skillSetsForQuiz.map(({ skill, section }) => ({
            name: skill.name, description: skill.description, section
          }))
        })
      });
      if (!res.ok) throw new Error('Failed to generate quiz passages.');
      const data = await res.json();
      if (!data.passageSets?.length) throw new Error('No passage sets received.');

      const sets: PassageSet[] = data.passageSets;
      setPassageSets(sets);
      setAnswers(sets.map(s => new Array(s.questions.length).fill(-1)));
      setConfidence(sets.map(s => new Array(s.questions.length).fill(null)));
      setTutorChats(sets.map(s => s.questions.map(() => [])));
    } catch (err: any) {
      setErrorMsg(err.message || 'Quiz generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── SUBMIT ANSWER ────────────────────────────────────────
  const handleCheck = () => {
    if (selectedOption === null || confidence === null || hasChecked) return;

    setAnswers(prev => prev.map((row, si) =>
      si === currentSetIdx ? row.map((v, qi) => qi === currentQIdx ? selectedOption : v) : row
    ));
    setConfidence(prev => prev.map((row, si) =>
      si === currentSetIdx ? row.map((v, qi) => qi === currentQIdx ? confidence : v) : row
    ));
    setHasChecked(true);
  };

  // ── NEXT QUESTION ────────────────────────────────────────
  const handleNext = () => {
    const set = passageSets[currentSetIdx];
    if (currentQIdx < set.questions.length - 1) {
      setCurrentQIdx(currentQIdx + 1);
    } else if (currentSetIdx < passageSets.length - 1) {
      setCurrentSetIdx(currentSetIdx + 1);
      setCurrentQIdx(0);
    } else {
      handleFinish();
      return;
    }
    setSelectedOption(null);
    setHasChecked(false);
    setConf(null);
    setTutorInput('');
  };

  // ── FINISH & FLAG LOW-CONFIDENCE SKILLS ─────────────────
  const handleFinish = () => {
    setQuizFinished(true);

    // For each passage set, if avg confidence is low or medium → increment unresolvedCount
    passageSets.forEach((set, si) => {
      const skillEntry = skillSetsForQuiz.find(e => e.skill.name === set.skillName);
      if (!skillEntry) return;

      const confs = confidenceMap[si] || [];
      const lowMedCount = confs.filter(c => c === 'low' || c === 'medium').length;
      const total = confs.length || 1;
      const lowMedRatio = lowMedCount / total;

      // If >50% of answers on this passage had low/medium confidence → re-flag
      if (lowMedRatio > 0.5) {
        const updated: MicroSkill = {
          ...skillEntry.skill,
          unresolvedCount: skillEntry.skill.unresolvedCount + 1,
          // Nudge mastery streak down so it re-appears at top of next week's list
          masteryStreak: Math.max(0, skillEntry.skill.masteryStreak - 1),
        };
        onUpdateMicroSkill(updated);
      }
    });
  };

  // ── TUTOR CHAT ───────────────────────────────────────────
  const handleTutorSend = async () => {
    if (!tutorInput.trim() || isTutorLoading) return;

    const set = passageSets[currentSetIdx];
    const q   = set?.questions[currentQIdx];
    if (!q) return;

    const userMsg: TutorMsg = { role: 'user', text: tutorInput.trim() };
    setTutorInput('');
    setTutorLoad(true);

    setTutorChats(prev => prev.map((setChats, si) =>
      si === currentSetIdx
        ? setChats.map((qChat, qi) => qi === currentQIdx ? [...qChat, userMsg] : qChat)
        : setChats
    ));

    const currentChat = tutorChats[currentSetIdx]?.[currentQIdx] || [];
    const history = currentChat.map(m => ({ sender: m.role === 'ai' ? 'assistant' : 'user', text: m.text }));

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history,
          microSkill: { name: set.skillName, description: '' },
          latestMessage: `[INTERLEAVED QUIZ CONTEXT]\nPassage: ${set.passage.slice(0, 300)}...\nQuestion: ${q.question}\nCorrect answer: ${q.options[q.correctAnswerIndex]}\nExplanation: ${q.explanation}\n\nStudent asks: ${userMsg.text}`
        })
      });
      const data = await res.json();
      const aiMsg: TutorMsg = { role: 'ai', text: data.assistantMessage || 'I had trouble generating a response.' };
      setTutorChats(prev => prev.map((setChats, si) =>
        si === currentSetIdx
          ? setChats.map((qChat, qi) => qi === currentQIdx ? [...qChat, aiMsg] : qChat)
          : setChats
      ));
    } catch {
      const errMsg: TutorMsg = { role: 'ai', text: 'Tutor unavailable right now. Review the explanation above.' };
      setTutorChats(prev => prev.map((setChats, si) =>
        si === currentSetIdx
          ? setChats.map((qChat, qi) => qi === currentQIdx ? [...qChat, errMsg] : qChat)
          : setChats
      ));
    } finally {
      setTutorLoad(false);
    }
  };

  // ── SCORE COMPUTATION ────────────────────────────────────
  const totalQs = passageSets.reduce((a, s) => a + s.questions.length, 0);
  const totalCorrect = passageSets.reduce((acc, set, si) =>
    acc + set.questions.reduce((a, q, qi) => a + (answers[si]?.[qi] === q.correctAnswerIndex ? 1 : 0), 0), 0);
  const scorePct = totalQs > 0 ? Math.round((totalCorrect / totalQs) * 100) : 0;
  const passed   = scorePct >= 80;

  // Low-confidence skills flagged for next week
  const reflagged = passageSets.filter((set, si) => {
    const confs = confidenceMap[si] || [];
    const lowMedCount = confs.filter(c => c === 'low' || c === 'medium').length;
    return lowMedCount / (confs.length || 1) > 0.5;
  }).map(s => s.skillName);

  const currentSet = passageSets[currentSetIdx];
  const currentQ   = currentSet?.questions[currentQIdx];
  const totalQSoFar = passageSets.slice(0, currentSetIdx).reduce((a, s) => a + s.questions.length, 0) + currentQIdx + 1;
  const currentTutorChat = tutorChats[currentSetIdx]?.[currentQIdx] || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-6 text-[#37352f]" id="interleaved-lab">

      {/* Header */}
      <div className="border-b border-[#e4e4e3] pb-4">
        <h1 className="text-xl font-bold tracking-tight text-[#37352f] font-sans flex items-center gap-2">
          <Layers size={18} className="text-[#37352f]/70" />
          Weekly Interleaved Quizzes
        </h1>
        <p className="text-xs text-[#37352f]/60 font-sans mt-0.5">
          3 full passages from your lowest-confidence concepts this week. Confidence check required per question.
        </p>
      </div>

      {/* ── START PANEL ── */}
      {!isLoading && !passageSets.length && !quizFinished && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-6 text-center space-y-5 max-w-2xl mx-auto shadow-[0_1px_3px_rgba(15,15,15,0.05)]" id="quiz-pre-setup">
          <div className="inline-flex p-3 bg-[#f7f7f5] rounded-full text-[#37352f]/70 border border-[#e4e4e3]">
            <Sparkles size={22} />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-[#37352f] text-sm">This Week's Passage Quiz</h3>
            <p className="text-xs text-[#37352f]/60 max-w-md mx-auto leading-normal">
              3 passages targeting your lowest-confidence concepts from the past 7 days.
              Each passage has 4 AAMC-style reasoning questions with confidence tracking and AI tutor access.
            </p>
          </div>

          <div className="p-3 bg-[#f7f7f5]/80 rounded border border-[#e4e4e3] text-left space-y-1.5">
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
                    <span className="text-[10px] text-[#37352f]/40">
                      {SECTION_LABELS[section] || section} · streak {skill.masteryStreak}/3
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMsg && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded font-medium border border-red-150">{errorMsg}</p>}

          <button
            onClick={handleStartQuiz}
            className="px-6 py-2 bg-[#37352f] hover:bg-[#2c2b27] text-white font-sans text-xs font-semibold rounded transition cursor-pointer w-full sm:w-auto"
          >
            Generate Weekly Quiz (3 Passages)
          </button>
        </div>
      )}

      {/* ── LOADING ── */}
      {isLoading && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-12 text-center space-y-3 max-w-2xl mx-auto" id="quiz-loading">
          <RefreshCw className="animate-spin text-[#37352f] h-6 w-6 mx-auto" />
          <h3 className="font-bold text-[#37352f] text-sm font-sans">Generating 3 passages...</h3>
          <p className="text-xs text-[#37352f]/50 max-w-xs mx-auto">
            Building AAMC-style passages for your lowest-confidence concepts from this week.
          </p>
        </div>
      )}

      {/* ── ACTIVE QUIZ ── */}
      {!isLoading && passageSets.length > 0 && !quizFinished && currentSet && currentQ && (
        <div className="space-y-3">

          {/* Progress strip */}
          <div className="bg-[#f7f7f5] border border-[#e4e4e3] p-3 rounded-md flex justify-between items-center">
            <div>
              <span className="text-[9px] font-bold text-[#37352f]/40 uppercase tracking-wider font-sans block">
                PASSAGE {currentSetIdx + 1} OF {passageSets.length} · {SECTION_LABELS[currentSet.section] || currentSet.section}
              </span>
              <span className="font-bold text-[#37352f]/80 font-sans text-xs">
                Question {currentQIdx + 1} of {currentSet.questions.length} &nbsp;·&nbsp; Overall {totalQSoFar}/{totalQs}
              </span>
            </div>
            <span className="px-1.5 py-0.5 bg-[#efeee3] border border-[#e4e4e3] text-[#37352f]/70 rounded text-[10px] font-bold font-sans">
              {currentSet.skillName}
            </span>
          </div>

          {/* Split panel */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Passage */}
            <div className="lg:w-[40%] bg-[#f7f7f5] border border-[#e4e4e3] rounded-md p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#37352f]/40 uppercase tracking-wider font-sans">
                <FileText size={11} />
                {currentSet.passageTitle || `Passage ${currentSetIdx + 1}`}
              </div>
              <p className="text-xs leading-relaxed font-sans text-[#37352f]/80 whitespace-pre-line">
                {currentSet.passage}
              </p>
            </div>

            {/* Question + confidence + answer */}
            <div className="lg:w-[60%] space-y-3">
              <div className="bg-white border border-[#e4e4e3] rounded-md p-5 space-y-4 shadow-[0_1px_3px_rgba(15,15,15,0.05)]">

                <h4 className="font-bold text-[#37352f] font-sans text-sm leading-normal">
                  {currentQ.question}
                </h4>

                {/* Options */}
                <div className="grid grid-cols-1 gap-1.5">
                  {currentQ.options.map((opt, idx) => {
                    const letters = ['A','B','C','D'];
                    const isSel  = selectedOption === idx;
                    const isCorr = idx === currentQ.correctAnswerIndex;

                    let cls  = 'border-[#e4e4e3] bg-white hover:bg-[#f7f7f5]/45';
                    let badge = 'bg-[#f1f1ef] text-[#37352f]';

                    if (isSel && !hasChecked) { cls = 'border-[#37352f] bg-[#efeee3] font-semibold'; badge = 'bg-[#37352f] text-white'; }
                    if (hasChecked) {
                      if (isCorr)       { cls = 'border-[#2ebd6e] bg-[#f0f9f4] text-[#195c36] font-bold'; badge = 'bg-[#2ebd6e] text-white'; }
                      else if (isSel)   { cls = 'border-red-400 bg-red-50 text-red-950'; badge = 'bg-red-500 text-white'; }
                      else              { cls = 'border-[#e4e4e3] bg-white opacity-40'; }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={hasChecked}
                        onClick={() => setSelectedOption(idx)}
                        className={`w-full text-left p-2.5 border rounded flex items-start gap-2.5 transition font-sans text-xs sm:text-sm cursor-pointer ${cls}`}
                      >
                        <span className={`h-5 w-5 rounded-sm shrink-0 flex items-center justify-center font-bold text-[10px] ${badge}`}>
                          {letters[idx]}
                        </span>
                        <span className="mt-0.5 leading-snug">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Confidence selector — required before submit */}
                {!hasChecked && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#37352f]/50 font-sans">
                      Confidence level (required):
                    </span>
                    <div className="flex gap-2">
                      {(['low','medium','high'] as const).map(c => (
                        <button
                          key={c}
                          onClick={() => setConf(c)}
                          className={`px-3 py-1 rounded border text-xs font-semibold cursor-pointer transition capitalize ${
                            confidence === c ? CONF_ACTIVE[c] : 'border-[#e4e4e3] bg-white text-[#37352f]/60 hover:border-[#37352f]/40'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence badge after submit */}
                {hasChecked && confidence && (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold ${CONF_COLORS[confidence]}`}>
                    Confidence: <span className="capitalize">{confidence}</span>
                    {confidence === 'high' && selectedOption !== currentQ.correctAnswerIndex && (
                      <span className="text-red-600 font-bold ml-1">— overconfident</span>
                    )}
                    {confidence === 'low' && selectedOption === currentQ.correctAnswerIndex && (
                      <span className="text-[#2563eb] font-bold ml-1">— underconfident</span>
                    )}
                  </div>
                )}

                {/* Submit / Next */}
                <div className="flex justify-end pt-1">
                  {!hasChecked ? (
                    <button
                      disabled={selectedOption === null || confidence === null}
                      onClick={handleCheck}
                      className="px-4 py-1.5 bg-[#37352f] text-white rounded font-sans text-xs font-semibold hover:bg-[#2c2b27] disabled:opacity-40 transition cursor-pointer"
                    >
                      Submit Answer
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      className="px-4 py-1.5 bg-[#37352f] text-white rounded font-sans text-xs font-semibold hover:bg-[#2c2b27] transition flex items-center gap-1 cursor-pointer"
                    >
                      {currentSetIdx === passageSets.length - 1 && currentQIdx === currentSet.questions.length - 1
                        ? 'Finish Quiz'
                        : currentQIdx === currentSet.questions.length - 1
                          ? 'Next Passage →'
                          : 'Next Question'
                      } <ArrowRight size={12} />
                    </button>
                  )}
                </div>

                {/* Explanation */}
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

              {/* AI Tutor chat (appears after answer checked) */}
              {hasChecked && (
                <div className="bg-white border border-[#e4e4e3] rounded-md overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#f7f7f5] border-b border-[#e4e4e3] flex items-center gap-2">
                    <Sparkles size={12} className="text-[#37352f]/50" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#37352f]/50 font-sans">
                      AI Tutor — Ask a follow-up
                    </span>
                  </div>

                  <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                    {currentTutorChat.length === 0 && (
                      <p className="text-xs text-[#37352f]/40 italic">Ask the AI tutor anything about this question or concept...</p>
                    )}
                    {currentTutorChat.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`px-3 py-2 rounded-lg text-xs max-w-[80%] leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-[#37352f] text-white'
                            : 'bg-[#f7f7f5] border border-[#e4e4e3] text-[#37352f]'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isTutorLoading && (
                      <div className="flex justify-start">
                        <div className="px-3 py-2 rounded-lg text-xs bg-[#f7f7f5] border border-[#e4e4e3] text-[#37352f]/50 flex items-center gap-1.5">
                          <RefreshCw size={10} className="animate-spin" /> Thinking...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="px-3 py-2 border-t border-[#e4e4e3] flex gap-2">
                    <input
                      type="text"
                      value={tutorInput}
                      onChange={e => setTutorInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleTutorSend()}
                      placeholder="Ask a question about this concept..."
                      className="flex-1 px-3 py-1.5 text-xs bg-[#f7f7f5] border border-[#e4e4e3] rounded font-sans focus:outline-none"
                    />
                    <button
                      onClick={handleTutorSend}
                      disabled={!tutorInput.trim() || isTutorLoading}
                      className="p-1.5 bg-[#37352f] text-white rounded disabled:opacity-40 cursor-pointer transition"
                    >
                      <Send size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FINISHED ── */}
      {quizFinished && (
        <div className="space-y-4 max-w-2xl mx-auto" id="quiz-finished-view">
          <div className="bg-white border border-[#e4e4e3] rounded-md p-6 space-y-5 shadow-[0_1px_3px_rgba(15,15,15,0.05)] text-center">
            <div className="inline-flex p-3 bg-[#f7f7f5] border border-[#e4e4e3] text-[#37352f]/70 rounded-full">
              <Award size={28} />
            </div>

            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-[#37352f] font-sans">Weekly Quiz Complete</h2>
              <p className="text-xs text-[#37352f]/60 font-sans">{passageSets.length} passages · {totalQs} questions</p>
            </div>

            {/* Score + pass/fail */}
            <div className={`py-3 px-4 rounded-md border flex items-center justify-center gap-4 ${
              passed ? 'bg-[#f0f9f4] border-[#2ebd6e]/30' : 'bg-[#fdf3f3] border-red-200/30'
            }`}>
              <div className="text-center">
                <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Score</span>
                <span className={`text-2xl font-bold block mt-0.5 ${passed ? 'text-[#195c36]' : 'text-red-700'}`}>
                  {scorePct}%
                </span>
              </div>
              <div className="border-l border-current opacity-20 h-8" />
              <div className="text-center">
                <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Raw</span>
                <span className={`text-2xl font-bold block mt-0.5 ${passed ? 'text-[#195c36]' : 'text-red-700'}`}>
                  {totalCorrect}/{totalQs}
                </span>
              </div>
              <div className="border-l border-current opacity-20 h-8" />
              <div className="text-center">
                <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Gate</span>
                <span className={`text-xs font-bold block mt-1 ${passed ? 'text-[#195c36]' : 'text-red-700'}`}>
                  {passed ? '✓ PASSED' : '✗ FAILED'}
                </span>
                <span className="text-[10px] text-[#37352f]/40 block">80% required</span>
              </div>
            </div>

            {/* Per-passage breakdown */}
            <div className="space-y-1.5 text-left">
              <span className="font-bold text-[#37352f]/40 uppercase tracking-wider text-[9px] block font-sans">Passage breakdown:</span>
              {passageSets.map((set, si) => {
                const correct = set.questions.reduce((a, q, qi) => a + (answers[si]?.[qi] === q.correctAnswerIndex ? 1 : 0), 0);
                const pct = Math.round((correct / set.questions.length) * 100);
                const confs = confidenceMap[si] || [];
                const lowMed = confs.filter(c => c === 'low' || c === 'medium').length;
                const reflagged = lowMed / (confs.length || 1) > 0.5;
                return (
                  <div key={si} className="flex items-center justify-between bg-[#f7f7f5] border border-[#e4e4e3] rounded px-3 py-2 text-xs gap-2">
                    <span className="font-medium text-[#37352f]/70 truncate flex-1">{set.skillName}</span>
                    <span className={`font-bold shrink-0 ${pct >= 75 ? 'text-[#2ebd6e]' : pct >= 50 ? 'text-[#d97706]' : 'text-red-500'}`}>
                      {correct}/{set.questions.length} ({pct}%)
                    </span>
                    {reflagged && (
                      <span className="flex items-center gap-1 text-[#d97706] font-semibold text-[10px] shrink-0">
                        <RotateCcw size={10} /> Next week
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pass/fail feedback */}
            <div className="p-3 bg-[#f7f7f5] border border-[#e4e4e3] rounded-md text-left text-xs leading-normal text-[#37352f]/70">
              {passed ? (
                <p>Strong performance. Keep building your streak in Socratic sessions.</p>
              ) : (
                <p>
                  Score below 80%. Return to Socratic coaching for passages you missed — work through the concept again and regenerate a mastery drill set before your next weekly quiz.
                </p>
              )}
              {reflagged.length > 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[#d97706]">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span><strong>{reflagged.join(', ')}</strong> had low/medium confidence and will be prioritized in next week's quiz.</span>
                </p>
              )}
            </div>

            <button
              onClick={handleStartQuiz}
              className="px-5 py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white text-xs font-semibold font-sans rounded transition cursor-pointer"
            >
              Generate New Weekly Quiz
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
