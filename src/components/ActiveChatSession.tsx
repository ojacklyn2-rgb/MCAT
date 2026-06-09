import React, { useState, useRef, useEffect } from 'react';
import { ChatSession, ChatMessage, PracticeQuestion, Flashcard, CardFormat, MicroSkill } from '../types';
import { Upload, MessageSquare, BookOpen, Layers, CheckCircle2, XCircle, ArrowRight, BookMarked, Sparkles, Send, RefreshCw, AlertCircle, FileText } from 'lucide-react';

interface ActiveChatSessionProps {
  key?: string;
  session: ChatSession;
  onUpdateSession: (updated: ChatSession) => void;
  onAddFlashcard: (card: Flashcard) => void;
  onUpdateMicroSkill: (skill: MicroSkill) => void;
}

export function ActiveChatSession({
  session,
  onUpdateSession,
  onAddFlashcard,
  onUpdateMicroSkill
}: ActiveChatSessionProps) {
  // Local state for forms
  const [inputText, setInputText] = useState('');
  const [inputImage, setInputImage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [messageText, setMessageText] = useState('');
  const [studentExplanation, setStudentExplanation] = useState('');
  const [isExplanationVerified, setIsExplanationVerified] = useState(false);
  const [explanationFeedback, setExplanationFeedback] = useState('');

  // Flashcard design fields
  const [cardFormat, setCardFormat] = useState<CardFormat>('basic');
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');

  // Active drill index
  const [activeDrillIndex, setActiveDrillIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  // Handle Drag & Drop / Image Selection
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Pease select an image file (PNG, JPG, etc.).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setInputImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) handleImageUpload(blob);
      }
    }
  };

  // 1. Submit Wrong Question (Error Intake)
  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !inputImage) {
      alert('Please fill in wrong question details or upload a screenshot first.');
      return;
    }

    setIsLoading(true);
    setLoadingStep('Classifying micro-skill gap & constructing Socratic outline...');

    try {
      const response = await fetch('/api/chat/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          image: inputImage
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API error ${response.status}: Failed to run intake.`);
      }

      const data = await response.json();

      // Create new MicroSkill
      const microSkillId = `skill_${Date.now()}`;
      const newSkill: MicroSkill = {
        id: microSkillId,
        name: data.microSkillName,
        description: data.microSkillDescription,
        broadTopic: data.broadTopic,
        masteryStreak: 0,
        unresolvedCount: 1
      };

      onUpdateMicroSkill(newSkill);

      // Create initial chat messages
      const initialMessages: ChatMessage[] = [
        {
          id: `msg_init_${Date.now()}`,
          sender: 'assistant',
          text: `**Micro-Skill Gap Detected:** ${data.microSkillName}\n\n**Analogy & Concept Blueprint:**\n${data.conceptSummary}\n\n**Diagnostic Socratic Question:**\n${data.socraticOpener}`,
          timestamp: Date.now()
        }
      ];

      // Update session stage & values
      onUpdateSession({
        ...session,
        stage: 'socratic',
        microSkill: newSkill,
        conceptSummary: data.conceptSummary,
        messages: initialMessages,
        errorInputText: inputText,
        errorInputImage: inputImage
      });
    } catch (err: any) {
      console.error(err);
      alert(`Intake failed: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // 2. Socratic Chat Send MESSAGE
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: Date.now()
    };

    const currentMessages = [...session.messages, userMsg];
    setMessageText('');

    // Pre-emptively update session so client sees user message instantly
    onUpdateSession({
      ...session,
      messages: currentMessages
    });

    setIsLoading(true);
    setLoadingStep('Tutor is listening, diagnosing, and drafting guidance...');

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: currentMessages,
          microSkill: session.microSkill,
          latestMessage: userMsg.text
        })
      });

      if (!response.ok) {
        throw new Error('Server error during Socratic dialog.');
      }

      const data = await response.json();

      const assistantMsg: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        sender: 'assistant',
        text: data.assistantMessage,
        timestamp: Date.now()
      };

      onUpdateSession({
        ...session,
        messages: [...currentMessages, assistantMsg]
      });

      // Show alert if ready for mastery but let user advance
      if (data.readyForMastery) {
        alert("The Socratic Coach feels you have demonstrated correct understanding! Hit 'Unlock Mastery Drills' in the layout whenever you feel ready.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Dialog error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // 3. Initiate Mastery drills
  const handleStartDrills = async () => {
    setIsLoading(true);
    setLoadingStep('Synthesizing 520+ level clinical passages & MCQ practice set...');

    try {
      const response = await fetch('/api/chat/generate-drills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microSkillName: session.microSkill?.name,
          microSkillDescription: session.microSkill?.description
        })
      });

      if (!response.ok) {
        throw new Error('Could not compile practice drills.');
      }

      const data = await response.json();
      
      onUpdateSession({
        ...session,
        stage: 'mastery',
        drills: data.drills,
        drillStreak: 0,
        drillHistory: []
      });

      setActiveDrillIndex(0);
      setSelectedOption(null);
      setHasSubmittedAnswer(false);
    } catch (err: any) {
      console.error(err);
      alert(`Drills failed: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // 4. Handle Drill Option selection and answering
  const handleAnswerSubmit = () => {
    if (selectedOption === null || hasSubmittedAnswer || !session.drills.length) return;

    const currentDrill = session.drills[activeDrillIndex];
    const isCorrect = selectedOption === currentDrill.correctAnswerIndex;
    let newStreak = isCorrect ? session.drillStreak + 1 : 0;

    setHasSubmittedAnswer(true);

    const historyItem = {
      questionId: currentDrill.id || `drill_${activeDrillIndex}`,
      correct: isCorrect
    };

    onUpdateSession({
      ...session,
      drillStreak: newStreak,
      drillHistory: [...session.drillHistory, historyItem]
    });

    // Update the microskill's overall diagnostic tracker
    if (session.microSkill) {
      const updatedSkill = {
        ...session.microSkill,
        masteryStreak: newStreak
      };
      if (newStreak >= 3) {
        updatedSkill.masteredAt = Date.now();
      }
      onUpdateMicroSkill(updatedSkill);
    }
  };

  const handleNextDrill = async () => {
    setSelectedOption(null);
    setHasSubmittedAnswer(false);

    const nextIdx = activeDrillIndex + 1;

    if (session.drillStreak >= 3) {
      // Completed mastery! Go to flashcard
      onUpdateSession({
        ...session,
        stage: 'flashcard'
      });
      return;
    }

    if (nextIdx < session.drills.length) {
      setActiveDrillIndex(nextIdx);
    } else {
      // Run out of drills but streak hasn't hit 3. Student must generate another batch!
      setIsLoading(true);
      setLoadingStep('Compiling replacement set of difficult 520+ MCQs to continue streak...');
      try {
        const response = await fetch('/api/chat/generate-drills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            microSkillName: session.microSkill?.name,
            microSkillDescription: session.microSkill?.description
          })
        });

        if (!response.ok) throw new Error('Failed generating fresh drills.');

        const data = await response.json();
        onUpdateSession({
          ...session,
          drills: data.drills
        });
        setActiveDrillIndex(0);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsLoading(false);
        setLoadingStep('');
      }
    }
  };

  // 5. Submit Explanation before flashcard
  const handleVerifyExplanation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentExplanation.trim()) {
      alert('Please type down your explanation of the concept.');
      return;
    }

    setIsLoading(true);
    setLoadingStep('Tutor is reviewing your explanation under a scientific lens...');

    try {
      const response = await fetch('/api/chat/verify-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          explanation: studentExplanation,
          microSkillName: session.microSkill?.name,
          microSkillDescription: session.microSkill?.description
        })
      });

      if (!response.ok) throw new Error('Explanation verification server failed.');

      const data = await response.json();
      setIsExplanationVerified(data.isAccurate);
      setExplanationFeedback(data.critique);

      // Pre-populate card text to help student speed up
      if (data.isAccurate) {
        setCardFront(`State the essential premise/factors of: ${session.microSkill?.name}`);
        setCardBack(studentExplanation);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // 6. Confirm and Lock in SRS Spaced Flashcard
  const handleCreateFlashcard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFront.trim() || !cardBack.trim()) {
      alert('Please complete both the Front/Prompt and Back/Answer of your flashcard.');
      return;
    }

    const newCard: Flashcard = {
      id: `card_${Date.now()}`,
      microSkillId: session.microSkill?.id || '',
      microSkillName: session.microSkill?.name || '',
      format: cardFormat,
      front: cardFront,
      back: cardBack,
      userExplanationCheck: studentExplanation,
      createdAt: Date.now(),
      repetitions: 0,
      interval: 1, // immediate next review interval
      easeFactor: 2.5,
      nextReviewDate: Date.now() + 24 * 60 * 60 * 1000 // 1 day out
    };

    onAddFlashcard(newCard);

    // Save chat as completed
    onUpdateSession({
      ...session,
      stage: 'completed'
    });

    alert('Flashcard entered into Spaced Repetition deck. Session Mastery complete!');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start max-w-7xl mx-auto px-6 relative min-h-[80vh] text-[#37352f]" onPaste={handlePaste} id="study-panel">
      
      {/* Loading overlay with helpful MCAT coaching tips - Clean Notion style wrapper */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#fbfbfa]/90 backdrop-blur-xs flex flex-col justify-center items-center rounded-md z-50 p-6 text-center" id="loading-overlay">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#37352f] border-t-transparent mb-4"></div>
          <p className="font-semibold text-sm text-[#37352f]">{loadingStep || 'Working with Gemini...'}</p>
          <div className="max-w-md mt-5 p-4 bg-[#f1f1ef] border border-[#e4e4e3] rounded text-[11px] text-[#37352f]/70 space-y-1">
            <span className="font-bold text-[#37352f] block uppercase tracking-wider text-[9px]">High-Yield 520+ Strategy</span>
            <p className="italic">"If you finish an MCAT question and only study why the correct answer is true, you missed 75% of the value. Analyze the molecular mechanical distraction of why every other chosen option is false."</p>
          </div>
        </div>
      )}

      {/* Main Workspace (Coaching Dialogue, drills, or flashcards) */}
      <div className="lg:col-span-8 flex flex-col space-y-5" id="main-coaching-box">
        
        {/* Progress Tracker Banner */}
        <div className="bg-white border border-[#e4e4e3] p-3.5 rounded-md flex items-center justify-between shadow-[0_1px_2px_rgba(15,15,15,0.05)]" id="session-stage-progress">
          <div>
            <span className="text-[10px] text-[#37352f]/40 font-semibold tracking-wider uppercase font-sans">WORKSPACE STAGE</span>
            <h3 className="font-bold text-[#37352f] font-sans text-xs capitalize mt-0.5">
              Socratic Stage: <span className="font-semibold">{session.stage}</span>
            </h3>
          </div>
          <div className="flex gap-1" id="stage-indicators">
            {['intake', 'socratic', 'mastery', 'flashcard', 'completed'].map((stg) => {
              const stages = ['intake', 'socratic', 'mastery', 'flashcard', 'completed'];
              const currentStgIdx = stages.indexOf(session.stage);
              const thisStgIdx = stages.indexOf(stg);
              const isActive = stg === session.stage;
              const isPast = thisStgIdx < currentStgIdx;

              return (
                <div
                  key={stg}
                  className={`h-2 w-8 rounded-sm transition-all ${
                    isActive ? 'bg-[#37352f] border border-[#37352f]' :
                    isPast ? 'bg-[#efeee3] border border-[#e4e4e3]' : 'bg-transparent border border-[#e4e4e3]'
                  }`}
                  title={stg}
                />
              );
            })}
          </div>
        </div>

        {/* ==================== STAGE 1: ERROR INTAKE ==================== */}
        {session.stage === 'intake' && (
          <div className="bg-white border border-[#e4e4e3] p-5 rounded-md space-y-5 shadow-[0_1px_2px_rgba(15,15,15,0.05)]" id="intake-form-box">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#37352f] font-sans tracking-tight">Error Intake Form</h2>
              <p className="text-xs text-[#37352f]/60 font-sans">
                Paste the question text, your scratch thoughts, or directly upload a screenshot of the MCAT passage.
              </p>
            </div>

            <form onSubmit={handleIntakeSubmit} className="space-y-4">
              
              {/* Drag & drop / click file container */}
              <div
                className="border-2 border-dashed border-[#e4e4e3] bg-[#f7f7f5]/40 rounded-md p-6 hover:border-zinc-400 hover:bg-[#f7f7f5]/80 transition text-center space-y-3 relative cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleImageUpload(e.dataTransfer.files[0]);
                  }
                }}
                id="image-dropzone"
              >
                {inputImage ? (
                  <div className="space-y-3" id="screenshot-preview">
                    <img
                      src={inputImage}
                      alt="MCAT Screenshot"
                      className="max-h-56 mx-auto rounded border border-[#e4e4e3] shadow-xs"
                    />
                    <div className="flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setInputImage('')}
                        className="px-2.5 py-1 text-[11px] bg-red-550/10 hover:bg-red-550/20 text-red-750 font-semibold rounded cursor-pointer transition-colors"
                        id="remove-screenshot-btn"
                      >
                        Remove Screenshot
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pointer-events-none" id="dropzone-empty-view">
                    <div className="inline-flex p-2.5 bg-white rounded border border-[#e4e4e3] text-[#37352f]/60 mb-1">
                      <Upload size={18} />
                    </div>
                    <p className="text-xs font-semibold text-[#37352f] font-sans">
                      Drag & Drop question screenshot here, or click to browse
                    </p>
                    <p className="text-[10px] text-[#37352f]/40 font-mono">
                      (Or paste directly using CMD+V / CTRL+V clipboard action)
                    </p>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Choose screenshot"
                />
              </div>

              {/* Text Input area */}
              <div className="space-y-1.5" id="text-input-group">
                <label className="text-[11px] font-bold text-[#37352f]/70 font-sans block" htmlFor="wrong-question-text">
                  Question Text or Scratchpad Thoughts (Optional if screenshot uploaded)
                </label>
                <textarea
                  id="wrong-question-text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste wrong question text here, include why you chose your wrong option, what you got confused by..."
                  className="w-full h-28 p-3 border border-[#e4e4e3] bg-white rounded font-sans text-xs focus:outline-none focus:border-zinc-400"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#37352f] hover:bg-[#2c2b27] text-white rounded font-sans text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                id="run-coaching-btn"
              >
                <Sparkles size={13} />
                Analyze Error & Connect Socratic Coach
              </button>
            </form>
          </div>
        )}

        {/* ==================== STAGE 2: SOCRATIC CHAT ==================== */}
        {session.stage === 'socratic' && (
          <div className="flex flex-col space-y-4" id="socratic-chat-section">

            {/* Concept Explanation Card — shown immediately on intake */}
            {session.conceptSummary && (
              <div className="bg-[#fffdf5] border border-[#e8e0c0] rounded-md p-4 space-y-2" id="concept-explanation-card">
                <div className="flex items-center gap-2 pb-1.5 border-b border-[#e8e0c0]">
                  <BookOpen size={13} className="text-amber-700 shrink-0" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Concept Gap Identified — {session.microSkill?.broadTopic}</span>
                </div>
                <h3 className="font-bold text-[#37352f] text-xs">{session.microSkill?.name}</h3>
                <p className="text-xs text-[#37352f]/80 leading-relaxed whitespace-pre-line">{session.conceptSummary}</p>
              </div>
            )}

            {/* Scrollable chat history — Socratic dialogue only */}
            <div className="bg-white border border-[#e4e4e3] p-4 rounded-md h-[380px] overflow-y-auto flex flex-col space-y-3.5" id="chat-messages-box">
              {session.messages.map((msg) => {
                const isAsst = msg.sender === 'assistant';
                // For the first assistant message, only show the socratic question part (skip concept summary already shown above)
                const displayText = isAsst && msg.text.includes('Diagnostic Socratic Question:')
                  ? msg.text.split('**Diagnostic Socratic Question:**').pop()?.trim() || msg.text
                  : msg.text;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isAsst ? 'justify-start' : 'justify-end'}`}
                    id={`message-bubble-${msg.id}`}
                  >
                    <div className={`max-w-[85%] rounded-md p-3 font-sans text-xs sm:text-sm leading-normal border shadow-[0_1px_2px_rgba(15,15,15,0.03)] ${
                      isAsst ? 'bg-[#f7f7f5] border-[#e4e4e3] text-[#37352f]' : 'bg-[#efeee3] border-[#e4e4e3] text-[#37352f] font-medium'
                    }`} id={`message-content-${msg.id}`}>
                      {isAsst ? (
                        <div className="space-y-2 whitespace-pre-wrap">
                          {displayText.split('\n\n').map((paragraph, pIdx) => {
                            const markedText = paragraph.split('**').map((tok, tIdx) => (
                              tIdx % 2 === 1 ? <strong key={tIdx} className="font-bold text-zinc-950">{tok}</strong> : tok
                            ));
                            return <p key={pIdx} className="text-[#37352f]/90 leading-relaxed text-xs sm:text-sm">{markedText}</p>;
                          })}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-xs sm:text-sm">{msg.text}</p>
                      )}
                      <div className={`text-[9px] mt-1 font-sans ${isAsst ? 'text-[#37352f]/45' : 'text-[#37352f]/50 text-right'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <form onSubmit={handleSendMessage} className="flex gap-2" id="chat-input-form">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Respond to the Socratic question, explain your thinking..."
                className="flex-1 p-2.5 border border-[#e4e4e3] rounded font-sans text-xs focus:outline-none focus:border-zinc-400 bg-white"
                id="chat-input-field"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#37352f] hover:bg-[#2c2b27] text-white rounded cursor-pointer flex items-center justify-center transition-colors"
                id="send-message-btn"
                title="Send Message"
              >
                <Send size={13} />
              </button>
            </form>

            {/* Unlock Mastery drills action */}
            <div className="bg-[#f7f7f5]/80 border border-[#e4e4e3] p-3.5 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3" id="unlock-drills-box">
              <div className="flex gap-2 items-start">
                <AlertCircle size={15} className="text-[#37352f]/60 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[#37352f] font-sans text-xs">Ready for Active Rigor?</h4>
                  <p className="text-[11px] text-[#37352f]/60 font-sans">
                    Once you've aligned the concept with the Coach, lock in understanding with 3-streak drills.
                  </p>
                </div>
              </div>
              <button
                onClick={handleStartDrills}
                className="px-3 py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white text-[11px] font-semibold rounded cursor-pointer flex items-center justify-center gap-1 shrink-0 transition-colors"
                id="initiate-drills-btn"
              >
                <BookOpen size={12} /> Start Mastery Drills <ArrowRight size={10} />
              </button>
            </div>
          </div>
        )}

        {/* ==================== STAGE 3: MASTERY DRILLS ==================== */}
        {session.stage === 'mastery' && session.drills && session.drills.length > 0 && (
          <div className="bg-white border border-[#e4e4e3] p-5 rounded-md space-y-5 shadow-[0_1px_2px_rgba(15,15,15,0.05)]" id="mastery-drills-panel">
            
            {/* Headers, Streak Counter */}
            <div className="flex justify-between items-center pb-3 border-b border-[#e4e4e3]" id="drills-stat-header">
              <div className="space-y-0.5">
                <span className="text-[10px] text-[#37352f]/40 font-semibold tracking-wider font-sans uppercase">ACTIVE RECALL CHALLENGE</span>
                <h3 className="font-bold text-[#37352f] font-sans text-xs">Target Streak Threshold: 3 in a row</h3>
              </div>
              
              {/* Streak bubbles */}
              <div className="flex items-center gap-2" id="streak-bubbles-container">
                <span className="text-xs font-bold text-[#37352f]/60 font-sans">Current Streak:</span>
                <div className="flex gap-1">
                  {[1, 2, 3].map((val) => (
                    <div
                      key={val}
                      className={`h-5 w-5 rounded-full flex items-center justify-center border font-sans text-[10px] font-bold transition-all ${
                        session.drillStreak >= val
                          ? 'bg-[#2ebd6e] text-white border-[#249557]'
                          : 'bg-[#f1f1ef] text-[#37352f]/50 border-[#e4e4e3]'
                      }`}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drill Content */}
            {(() => {
              const currentDrill = session.drills[activeDrillIndex];
              if (!currentDrill) return <div className="text-center font-sans text-xs text-[#37352f]/50 py-12">Retrieving question state...</div>;

              return (
                <div className="space-y-4" id={`drill-item-${activeDrillIndex}`}>
                  
                  {/* Research/Clinical Passage Box */}
                  {currentDrill.passage && (
                    <div className="p-3.5 bg-[#f7f7f5]/80 border border-[#e4e4e3] rounded-md text-[11px] leading-relaxed font-sans text-[#37352f]/85 space-y-1.5" id="drill-passage-box">
                      <span className="font-bold text-[#37352f]/50 block uppercase tracking-wider text-[9px] flex items-center gap-1 font-sans">
                        <FileText size={11} /> CLINICAL PASSAGE / EXPERIMENT PROTOCOL
                      </span>
                      <p className="leading-normal">{currentDrill.passage}</p>
                    </div>
                  )}

                  {/* Figure placeholder if question references a graph/figure */}
                  {/figure|graph|chart|table|shown below|diagram|plot|curve/i.test((currentDrill.passage || '') + currentDrill.question) && (
                    <div className="border border-dashed border-[#c0b8a0] bg-[#fafaf7] rounded p-3 text-center text-[11px] text-[#37352f]/50 font-sans italic" id="figure-placeholder">
                      [ Figure referenced in this question — not shown. Use the passage context and your knowledge to answer. ]
                    </div>
                  )}

                  {/* Core Question Text */}
                  <h4 className="font-bold text-[#37352f] font-sans text-xs sm:text-sm leading-normal" id="drill-question-text">
                    Q: {currentDrill.question}
                  </h4>

                  {/* Option Choice grid */}
                  <div className="grid grid-cols-1 gap-2" id="drill-options-grid">
                    {currentDrill.options.map((option, idx) => {
                      const letters = ['A', 'B', 'C', 'D'];
                      const isSelected = selectedOption === idx;
                      const isCorrectAnswer = idx === currentDrill.correctAnswerIndex;
                      
                      let containerClass = "border-[#e4e4e3] bg-white hover:bg-[#f7f7f5]/40";
                      let badgeClass = "bg-[#f1f1ef] text-[#37352f]";

                      if (isSelected) {
                        containerClass = "border-[#37352f] bg-[#efeee3] font-semibold";
                        badgeClass = "bg-[#37352f] text-white";
                      }

                      if (hasSubmittedAnswer) {
                        if (isCorrectAnswer) {
                          containerClass = "border-[#2ebd6e] bg-[#f0f9f4] text-[#1b5d38] font-bold";
                          badgeClass = "bg-[#2ebd6e] text-white";
                        } else if (isSelected) {
                          containerClass = "border-red-400 bg-red-50/40 text-red-950";
                          badgeClass = "bg-red-500 text-white";
                        } else {
                          containerClass = "border-[#e4e4e3] bg-white opacity-40";
                        }
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={hasSubmittedAnswer}
                          onClick={() => setSelectedOption(idx)}
                          className={`w-full text-left p-3 border rounded-md flex items-start gap-2.5 transition-all font-sans text-xs sm:text-sm cursor-pointer ${containerClass}`}
                          id={`option-btn-${idx}`}
                        >
                          <span className={`h-5 w-5 rounded-sm shrink-0 flex items-center justify-center font-bold text-[10px] border border-transparent font-sans ${badgeClass}`}>
                            {letters[idx]}
                          </span>
                          <span className="mt-0.5 leading-snug">{option}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div className="flex justify-end gap-2.5 pt-2" id="drill-execution-footer">
                    {!hasSubmittedAnswer ? (
                      <button
                        type="button"
                        disabled={selectedOption === null}
                        onClick={handleAnswerSubmit}
                        className="px-4 py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white rounded font-sans text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer"
                        id="submit-choice-btn"
                      >
                        Submit Answer Choice
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleNextDrill}
                        className="px-4 py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white rounded font-sans text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                        id="proceed-drill-btn"
                      >
                        {session.drillStreak >= 3 ? 'Unlock Flashcard Builder' : 'Next MCQ Challenge'} <ArrowRight size={12} />
                      </button>
                    )}
                  </div>

                  {/* High yield feedback/rationales - Styled like Notion Callout Boxes */}
                  {hasSubmittedAnswer && (
                    <div className={`p-4 rounded-md border space-y-1.5 mt-3 text-xs font-sans ${
                      selectedOption === currentDrill.correctAnswerIndex
                        ? 'bg-[#f0f9f4] border-[#249557]/30 text-[#1b5d38]'
                        : 'bg-[#fdf3f3] border-[#e0b0b0]/30 text-[#6b2121]'
                    }`} id="drill-explanations-box">
                      <div className="flex items-center gap-1 font-bold uppercase tracking-wider text-[9px]">
                        {selectedOption === currentDrill.correctAnswerIndex ? (
                          <span className="flex items-center gap-1.5 text-[#1b5d38]"><CheckCircle2 size={12} /> CORRECT ACQUISITION</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[#6b2121]"><XCircle size={12} /> ENCOUNTERED MISCONCEPTION</span>
                        )}
                      </div>
                      <p className="font-bold leading-normal text-xs pt-1">
                        Explanation Mechanics:
                      </p>
                      <p className="leading-relaxed opacity-90 whitespace-pre-line text-xs font-sans antialiased text-[#37352f]/90">
                        {currentDrill.explanation}
                      </p>
                    </div>
                  )}

                </div>
              );
            })()}

          </div>
        )}

        {/* ==================== STAGE 4: FLASHCARD AND COGNITIVE CHECK ==================== */}
        {session.stage === 'flashcard' && (
          <div className="bg-white border border-[#e4e4e3] p-5 rounded-md space-y-5 shadow-[0_1px_2px_rgba(15,15,15,0.05)]" id="flashcard-workspace">
            
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-[#37352f] font-sans tracking-tight">Active Flashcard Synthesis</h2>
              <p className="text-xs text-[#37352f]/60 font-sans">
                Mastery drills passed! To commit this micro-skill to your spacing deck, explain the concept in your own words.
              </p>
            </div>

            {/* Socratic concept verification */}
            <form onSubmit={handleVerifyExplanation} className="space-y-3.5 p-4 bg-[#f8f8f6] border border-[#e4e4e3] rounded-md">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#37352f]/85 font-sans block" htmlFor="own-explanation">
                  Prove Understanding: Write your plain-language explanation of the mechanic
                </label>
                <textarea
                  id="own-explanation"
                  value={studentExplanation}
                  onChange={(e) => setStudentExplanation(e.target.value)}
                  placeholder="Explain exactly how this molecular mechanism or formula works, including any caveats or clinical significance you learned."
                  className="w-full h-24 p-3 bg-white border border-[#e4e4e3] rounded font-sans text-xs focus:outline-none focus:border-zinc-455"
                  disabled={isExplanationVerified}
                />
              </div>

              {!isExplanationVerified && (
                <button
                  type="submit"
                  className="w-full py-1.5 bg-[#37352f] hover:bg-[#2c2b27] text-white text-xs font-semibold rounded font-sans transition-colors cursor-pointer"
                  id="verify-explanation-btn"
                >
                  Verify Conceptual Understanding
                </button>
              )}
            </form>

            {/* Socratic judge critique markup */}
            {explanationFeedback && (
              <div className={`p-4 rounded-md border text-xs font-sans space-y-1.5 ${
                isExplanationVerified ? 'bg-[#f0f9f4] border-[#249557]/20 text-[#1b5d38]' : 'bg-[#fff9e6] border-[#e0c060]/30 text-[#705000]'
              }`} id="critic-feedback-box">
                <span className="font-bold block uppercase tracking-wider text-[9px]">
                  {isExplanationVerified ? '★ UNDERSTANDING VERIFIED' : '⚠ CRITIQUE & GAP IDENTIFIED'}
                </span>
                <p className="leading-relaxed whitespace-pre-line text-[#37352f]/90 text-xs">{explanationFeedback}</p>
                {!isExplanationVerified && (
                  <span className="text-[9px] text-[#37352f]/45 block font-sans">Modify your explanation above to fix the highlighted gaps and retry.</span>
                )}
              </div>
            )}

            {/* Flashcard config once verified */}
            {isExplanationVerified && (
              <form onSubmit={handleCreateFlashcard} className="space-y-5 border-t border-[#e4e4e3] pt-4 animate-fade-in" id="card-builder-form">
                
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#37352f]/85 font-sans block">Design Flashcard Format</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" id="format-grid">
                    {[
                      { id: 'basic', label: 'Basic Q/A' },
                      { id: 'cloze', label: 'Cloze Deletion' },
                      { id: 'occlusion', label: 'Image Occlusion' },
                      { id: 'sequence', label: 'Process Sequence' }
                    ].map((format) => (
                      <button
                        key={format.id}
                        type="button"
                        onClick={() => {
                          setCardFormat(format.id as CardFormat);
                          if (format.id === 'cloze') {
                            setCardFront('Equation for Henderson-Hasselbalch: pH = pKa + log([A-] / [B]) is a Cloze with [...].');
                          }
                        }}
                        className={`py-1.5 px-3 border text-xs font-medium rounded font-sans cursor-pointer transition-all ${
                          cardFormat === format.id 
                            ? 'bg-[#37352f] border-[#37352f] text-white font-semibold' 
                            : 'bg-white border-[#e4e4e3] text-[#37352f]/70 hover:border-zinc-350'
                        }`}
                      >
                        {format.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Helper info based on format */}
                <div className="p-3 bg-[#f7f7f5]/80 border border-[#e4e4e3] rounded text-[11px] text-[#37352f]/60 font-sans" id="format-guidelines">
                  {cardFormat === 'basic' && <p><strong>Basic:</strong> Type a direct high-yield question on the front, and the strict technical mechanism on the back.</p>}
                  {cardFormat === 'cloze' && <p><strong>Cloze:</strong> Front contains a sentence with some parts replacement like '[...]' or '{"{{c1::word}}"}' . Back holds the missing terms.</p>}
                  {cardFormat === 'occlusion' && <p><strong>Image Occlusion (Text Described):</strong> Describe a complex experimental chart, histological slide, or biochemistry scheme in details on the Front, leaving a component blank. Give state of that blank on the back.</p>}
                  {cardFormat === 'sequence' && <p><strong>Process Sequence:</strong> List physiological steps or reaction pathways step-by-step. Let the back list the items in the correct chronologic progression.</p>}
                </div>

                {/* Front Prompt */}
                <div className="space-y-1" id="front-prompt-group">
                  <label className="text-[10px] font-bold text-[#37352f]/50 font-sans block tracking-wider" htmlFor="card-front">
                    CARD PROMPT (FRONT)
                  </label>
                  <textarea
                    id="card-front"
                    value={cardFront}
                    onChange={(e) => setCardFront(e.target.value)}
                    className="w-full h-20 p-2.5 border border-[#e4e4e3] rounded font-sans text-xs focus:outline-none bg-white"
                    placeholder="Write prompt text..."
                  />
                </div>

                {/* Back Answer */}
                <div className="space-y-1" id="back-prompt-group">
                  <label className="text-[10px] font-bold text-[#37352f]/50 font-sans block tracking-wider" htmlFor="card-back">
                    RECALL ANSWER (BACK)
                  </label>
                  <textarea
                    id="card-back"
                    value={cardBack}
                    onChange={(e) => setCardBack(e.target.value)}
                    className="w-full h-20 p-2.5 border border-[#e4e4e3] rounded font-sans text-xs focus:outline-none bg-white"
                    placeholder="Write detailed answer..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-[#37352f] text-white rounded font-sans font-semibold text-xs hover:bg-[#2c2b27] transition-all uppercase tracking-wider cursor-pointer"
                  id="final-confirm-srs-btn"
                >
                  Confirm and Add to SRS Deck
                </button>
              </form>
            )}

          </div>
        )}

        {/* ==================== STAGE 5: COMPLETED ==================== */}
        {session.stage === 'completed' && (
          <div className="bg-white border border-[#e4e4e3] p-8 rounded-md text-center space-y-4 shadow-[0_1px_2px_rgba(15,15,15,0.05)]" id="completed-deck-panel">
            <div className="inline-flex p-3 bg-emerald-50 text-emerald-800 rounded-sm border border-emerald-200 mb-2">
              <BookMarked size={20} />
            </div>
            <h2 className="text-base font-bold text-[#37352f] font-sans tracking-tight">Active Concept Mastered!</h2>
            <p className="text-xs text-[#37352f]/60 font-sans max-w-md mx-auto leading-relaxed">
              You clicked completion. The micro-skill gap <strong>"{session.microSkill?.name}"</strong> has been categorized, drilled, and mapped into your spaced repetition deck. Keep reviewing cards regularly.
            </p>
            <div className="pt-2 text-[10px] text-[#37352f]/40 font-mono" id="completed-actions">
              <span>Mastery Completed: {new Date(session.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        )}

      </div>

      {/* Side Diagnostics Panel (Always display the active micro-skill analysis or WRONG question screenshot once logged) */}
      <div className="lg:col-span-4 space-y-5 animate-fade-in" id="coaching-side-sidebar">
        
        {/* Identified Gap Diagnostics Board */}
        {session.microSkill ? (
          <div className="bg-[#f7f7f5] border border-[#e4e4e3] rounded-md p-4 space-y-3.5" id="side-classified-panel">
            <div className="space-y-0.5 pb-2 border-b border-[#e4e4e3]">
              <span className="text-[9px] font-bold text-amber-600 block uppercase tracking-wider">Identified MCQ Diagnostic</span>
              <h4 className="font-bold text-[#37352f] font-sans text-xs tracking-tight">Mastery Details</h4>
            </div>

            <div className="space-y-3 text-xs font-sans text-[#37352f]/70" id="side-gaps-list">
              <div>
                <span className="font-bold text-[#37352f]/40 block uppercase tracking-wider text-[8px] font-sans">Micro-Skill Concept</span>
                <p className="font-bold text-[#37352f] mt-0.5">{session.microSkill.name}</p>
              </div>

              <div>
                <span className="font-bold text-[#37352f]/40 block uppercase tracking-wider text-[8px] font-sans">Overarching MCAT Class</span>
                <p className="font-semibold text-[#37352f]/80 mt-0.5">{session.microSkill.broadTopic}</p>
              </div>

              <div>
                <span className="font-bold text-[#37352f]/40 block uppercase tracking-wider text-[8px] font-sans">Analytical Summary</span>
                <p className="italic text-[#37352f]/60 leading-normal mt-0.5 text-[11px]">{session.microSkill.description}</p>
              </div>

              {session.conceptSummary && (
                <div className="pt-3 border-t border-[#e4e4e3]">
                  <span className="font-bold text-[#37352f]/40 block uppercase tracking-wider text-[8px] font-sans">Memory Hook & Analogy</span>
                  <p className="mt-1 text-[#37352f]/70 leading-relaxed text-[11px] line-clamp-6" title={session.conceptSummary}>
                    {session.conceptSummary}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#f7f7f5]/40 border border-[#e4e4e3] rounded-md p-5 text-center text-[#37352f]/40 text-xs font-sans py-12" id="side-no-gap-indicator">
            No active micro-skill gap classified. Upload your wrong question to populate live diagnostics.
          </div>
        )}

        {/* Uploaded Incorrect Question Preview — compact thumbnail */}
        {session.errorInputImage && (
          <div className="bg-white border border-[#e4e4e3] rounded-md p-3 space-y-2 shadow-[0_1px_2px_rgba(15,15,15,0.03)]" id="side-screenshot-panel">
            <span className="font-semibold text-[#37352f]/50 block uppercase tracking-wider text-[8px] font-sans">Source Question</span>
            <img
              src={session.errorInputImage}
              alt="Source Question"
              className="w-full max-h-36 object-cover object-top rounded border border-[#e4e4e3] cursor-zoom-in hover:opacity-90 transition-opacity"
              onClick={() => {
                const w = window.open();
                if (w) w.document.write(`<img src="${session.errorInputImage}" style="max-width:100%;height:auto;" />`);
              }}
              title="Click to view full size"
            />
            <p className="text-[9px] text-[#37352f]/40 font-sans text-center">Click to expand</p>
          </div>
        )}
      </div>

    </div>
  );
}
