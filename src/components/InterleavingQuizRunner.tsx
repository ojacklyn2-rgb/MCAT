import React, { useState } from 'react';
import { MicroSkill, PracticeQuestion } from '../types';
import { Sparkles, ArrowRight, CheckCircle2, XCircle, RefreshCw, Layers, Award, FileText, CheckCircle } from 'lucide-react';

interface InterleavingQuizRunnerProps {
  microSkills: MicroSkill[];
}

export function InterleavingQuizRunner({ microSkills }: InterleavingQuizRunnerProps) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ [index: number]: number }>({});
  const [hasCheckedCurrent, setHasCheckedCurrent] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Settle mastered or available skills to interleave
  // If they have no mastered skills, we fall back to all logged skills so they can still quiz
  const masteredSkills = microSkills.filter(s => s.masteryStreak >= 3 || s.masteredAt);
  const fallbackSkills = microSkills.length > 0 ? microSkills : [];
  const selectedSkillsForQuiz = masteredSkills.length >= 2 ? masteredSkills : fallbackSkills;

  // Initiate Interleaved Quiz synthesis
  const handleStartQuiz = async () => {
    if (selectedSkillsForQuiz.length === 0) {
      setErrorMsg('You need to log at least one micro-skill gap in Socratic chat to synthesize a custom interleaved quiz.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setSelectedOption(null);
    setHasCheckedCurrent(false);
    setQuizFinished(false);

    try {
      const response = await fetch('/api/quiz/generate-interleaved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microSkills: selectedSkillsForQuiz.map(s => ({ name: s.name, description: s.description }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to synchronize quiz passages.');
      }

      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        throw new Error('No questions received from generator.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Interleaved quiz generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckAnswer = () => {
    if (selectedOption === null || hasCheckedCurrent) return;
    setAnswers({ ...answers, [currentIndex]: selectedOption });
    setHasCheckedCurrent(true);
  };

  const handleNext = () => {
    setSelectedOption(null);
    setHasCheckedCurrent(false);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setQuizFinished(true);
    }
  };

  // Score computation
  const correctCount = questions.reduce((acc, q, idx) => {
    const chosen = answers[idx];
    return chosen === q.correctAnswerIndex ? acc + 1 : acc;
  }, 0);

  const scorePercentage = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-6 text-[#37352f]" id="interleaved-lab">
      
      {/* Header */}
      <div className="border-b border-[#e4e4e3] pb-4" id="quiz-header">
        <h1 className="text-xl font-bold tracking-tight text-[#37352f] font-sans flex items-center gap-2">
          <Layers size={18} className="text-[#37352f]/70" />
          On-Demand Interleaved Quizzes
        </h1>
        <p className="text-xs text-[#37352f]/60 font-sans mt-0.5">
          Simulate high-stakes testing settings by scrambling multiple mastered microconcept gaps within a single clinical drill.
        </p>
      </div>

      {/* Start Quiz Panel */}
      {!isLoading && !questions.length && !quizFinished && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-6 text-center space-y-5 max-w-2xl mx-auto shadow-[0_1px_3px_rgba(15,15,15,0.05)]" id="quiz-pre-setup">
          <div className="inline-flex p-3 bg-[#f7f7f5] rounded-full text-[#37352f]/70 border border-[#e4e4e3]">
            <Sparkles size={20} />
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-[#37352f] text-sm">Custom Lab Quiz Synthesis</h3>
            <p className="text-xs text-[#37352f]/60 max-w-md mx-auto leading-normal">
              We compile exactly 5 highly rigorous clinical/physiological MCQs testing your personal micro-skill gaps.
            </p>
          </div>

          {/* Mastered topics catalog */}
          <div className="p-3 bg-[#f7f7f5]/80 rounded border border-[#e4e4e3] text-left text-xs space-y-1.5" id="mastered-topics-roster">
            <span className="font-bold uppercase tracking-wider text-[9px] text-[#37352f]/45 font-sans block">Concepts Selected for Scrambling:</span>
            {selectedSkillsForQuiz.length === 0 ? (
              <p className="text-[#37352f]/40 italic">No micro-skills logged yet. Write or upload mistake diagnostics in the "New Session" first.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1" id="topic-tags">
                {selectedSkillsForQuiz.map((skill) => (
                  <span key={skill.id} className="px-1.5 py-0.5 bg-white border border-[#e4e4e3] font-semibold rounded text-[11px] text-[#37352f]/80 block">
                    {skill.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded font-medium border border-red-150">{errorMsg}</p>
          )}

          <button
            onClick={handleStartQuiz}
            type="button"
            className="px-6 py-2 bg-[#37352f] hover:bg-[#2c2b27] text-white font-sans text-xs font-semibold rounded transition cursor-pointer w-full sm:w-auto"
            id="synth-quiz-btn"
          >
            Synthesize Interleaved Quiz (5 Questions)
          </button>
        </div>
      )}

      {/* Loading view */}
      {isLoading && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-12 text-center space-y-3 max-w-2xl mx-auto shadow-[0_1px_3px_rgba(15,15,15,0.05)]" id="quiz-loading">
          <RefreshCw className="animate-spin text-[#37352f] h-6 w-6 mx-auto" />
          <h3 className="font-bold text-[#37352f] text-sm font-sans">Scrambling Molecular Blueprints...</h3>
          <p className="text-xs text-[#37352f]/50 max-w-xs mx-auto">Gemini is synthesizing high-difficulty clinical passages and organizing question interleaving constraints.</p>
        </div>
      )}

      {/* Active Question View */}
      {!isLoading && questions.length > 0 && !quizFinished && (
        <div className="space-y-4" id="active-quiz-container">
          
          {/* Header step progress */}
          <div className="bg-[#f7f7f5] border border-[#e4e4e3] p-3 rounded-md flex justify-between items-center text-xs" id="quiz-progress-bar">
            <div>
              <span className="text-[9px] font-bold text-[#37352f]/40 uppercase tracking-wider font-sans">SCRAMBLED INTERLEAVED EVALUATION</span>
              <h4 className="font-bold text-[#37352f]/80 font-sans text-xs mt-0.5">MCQ {currentIndex + 1} of {questions.length}</h4>
            </div>
            
            {/* Tested topic label */}
            <span className="px-1.5 py-0.5 bg-[#efeee3] border border-[#e4e4e3] text-[#37352f]/70 rounded text-[10px] font-bold uppercase tracking-wider font-sans">
              Tested Concept: {questions[currentIndex].microSkill || 'Diagnostics'}
            </span>
          </div>

          <div className="bg-white border border-[#e4e4e3] p-5 rounded-md space-y-4 shadow-[0_1px_3px_rgba(15,15,15,0.05)]" id="quiz-drill-panel">
            
            {/* Clinical Passage (if provided) */}
            {questions[currentIndex].passage && (
              <div className="p-3 bg-[#f7f7f5] border border-[#e4e4e3] rounded text-xs leading-relaxed font-sans text-[#37352f]/80 max-h-48 overflow-y-auto" id="quiz-passage">
                <span className="font-bold text-[#37352f]/40 block uppercase tracking-wider text-[8px] font-sans flex items-center gap-1 mb-1">
                  <FileText size={10} /> CLINICAL CASE PROTOCOL
                </span>
                <p>{questions[currentIndex].passage}</p>
              </div>
            )}

            {/* Question description */}
            <h4 className="font-bold text-[#37352f] font-sans text-xs sm:text-sm leading-normal" id="quiz-question">
              Q: {questions[currentIndex].question}
            </h4>

            {/* Option Choice grid */}
            <div className="grid grid-cols-1 gap-1.5" id="quiz-options">
              {questions[currentIndex].options.map((option, idx) => {
                const letters = ['A', 'B', 'C', 'D'];
                const isSelected = selectedOption === idx;
                const isCorrectAnswer = idx === questions[currentIndex].correctAnswerIndex;

                let optClass = "border-[#e4e4e3] bg-white hover:bg-[#f7f7f5]/45";
                let badgeClass = "bg-[#f1f1ef] text-[#37352f]";

                if (isSelected) {
                  optClass = "border-[#37352f] bg-[#efeee3] font-semibold";
                  badgeClass = "bg-[#37352f] text-white";
                }

                if (hasCheckedCurrent) {
                  if (isCorrectAnswer) {
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
                    disabled={hasCheckedCurrent}
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

            {/* Actions */}
            <div className="flex justify-end pt-2" id="quiz-controls-footer">
              {!hasCheckedCurrent ? (
                <button
                  type="button"
                  disabled={selectedOption === null}
                  onClick={handleCheckAnswer}
                  className="px-4 py-1.5 bg-[#37352f] text-white rounded font-sans text-xs font-semibold hover:bg-[#2c2b27] disabled:opacity-40 transition cursor-pointer"
                  id="quiz-check-btn"
                >
                  Verify Answer Selection
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-1.5 bg-[#37352f] text-white rounded font-sans text-xs font-semibold hover:bg-[#2c2b27] transition flex items-center gap-1 cursor-pointer"
                  id="quiz-next-btn"
                >
                  {currentIndex === questions.length - 1 ? 'Finish interleaved quiz' : 'Next Question'} <ArrowRight size={12} />
                </button>
              )}
            </div>

            {/* Explanation rationale overlay */}
            {hasCheckedCurrent && (
              <div className={`p-3 rounded border text-xs font-sans space-y-1 ${
                selectedOption === questions[currentIndex].correctAnswerIndex
                  ? 'bg-[#f0f9f4] border-[#2ebd6e]/20 text-[#195c36]'
                  : 'bg-[#fdf3f3] border-red-200/30 text-[#6a1d1d]'
              }`} id="quiz-explanation-box">
                <span className="font-bold flex items-center gap-1 text-[9px] uppercase tracking-wider">
                  {selectedOption === questions[currentIndex].correctAnswerIndex ? (
                    <span className="text-[#195c36] flex items-center gap-1"><CheckCircle2 size={12} /> Correct acquisition</span>
                  ) : (
                    <span className="text-[#6a1d1d] flex items-center gap-1"><XCircle size={12} /> ENCOUNTERED FALSE SCHEME</span>
                  )}
                </span>
                <p className="leading-relaxed opacity-95 text-xs text-[#37352f]/90">
                  {questions[currentIndex].explanation}
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Quiz Finished View */}
      {quizFinished && (
        <div className="bg-white border border-[#e4e4e3] rounded-md p-6 space-y-5 max-w-2xl mx-auto shadow-[0_1px_3px_rgba(15,15,15,0.05)] text-center" id="quiz-finished-view">
          <div className="inline-flex p-3 bg-[#f7f7f5] border border-[#e4e4e3] text-[#37352f]/70 rounded-full">
            <Award size={28} />
          </div>

          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-[#37352f] font-sans tracking-tight">Interleaved Trial Completed!</h2>
            <p className="text-xs text-[#37352f]/60 font-sans">You have submitted responses for all 5 interleaved questions.</p>
          </div>

          <div className="py-3 border-y border-[#e4e4e3] grid grid-cols-2 gap-4 max-w-xs mx-auto text-xs" id="score-block">
            <div className="text-center">
              <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Accuracy</span>
              <span className="text-xl font-bold text-[#37352f] block mt-0.5">{scorePercentage}%</span>
            </div>
            <div className="text-center border-l border-[#e4e4e3]">
              <span className="text-[9px] text-[#37352f]/50 block uppercase font-bold">Raw score</span>
              <span className="text-xl font-bold text-[#37352f] block mt-0.5">{correctCount} <span className="text-xs text-[#37352f]/40">/ 5</span></span>
            </div>
          </div>

          {/* Quick analysis summary */}
          <div className="p-3 bg-[#f7f7f5] border border-[#e4e4e3] rounded-md text-left text-xs space-y-1 max-w-md mx-auto leading-normal text-[#37352f]/70" id="quiz-recap font-sans">
            <span className="font-bold text-[#37352f]/40 uppercase tracking-wider text-[8px] block font-sans">Performance evaluation:</span>
            {scorePercentage >= 80 ? (
              <p className="text-[11px]">Excellent active processing! Scrambling clinical schemas was successful. Track due SRS intervals on scheduled times.</p>
            ) : (
              <p className="text-[11px]">Valuable review points discovered. Return to Socratic coach to map unresolved variable gaps before generating fresh quizzes.</p>
            )}
          </div>

          <button
            onClick={handleStartQuiz}
            type="button"
            className="px-5 py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white text-xs font-semibold font-sans rounded transition cursor-pointer"
            id="synth-another-btn"
          >
            Synthesize New Interleaved Trial
          </button>
        </div>
      )}

    </div>
  );
}
