// CU-TEP Reading Comprehension Practice App Engine v2.0
// Designed for Maximum Usability, Practicality, and Precision

// --- STATE MANAGEMENT ---
let state = {
  appMode: 'exam', // 'exam' | 'practice'
  currentSectionIndex: 0,
  currentQuestionNum: 1, // 1 to 58
  userAnswers: {}, // { [questionNum]: 'A' | 'B' | 'C' | 'D' }
  flaggedQuestions: new Set(),
  highlights: {}, // { [sectionId]: htmlString }
  timerSeconds: 70 * 60, // 70 minutes
  timerRunning: true,
  timerInterval: null,
  isSubmitted: false,
  fontSizeOffset: 0, // -1, 0, 1, 2
  currentTheme: 'light',
  soundEnabled: true,
  showThaiTranslation: false,
  searchKeyword: '',
  mobileView: 'question' // 'passage' | 'question'
};

// Question Category Classifier
function getQuestionType(qNum) {
  if (qNum <= 15) return 'Cloze Blank (เติมคำในช่องว่าง)';
  if ([16, 21, 28, 45, 48].includes(qNum)) return 'Main Idea / Title (ใจความสำคัญ)';
  if ([30, 42].includes(qNum)) return 'Vocabulary in Context (คำศัพท์จากบริบท)';
  if ([32, 33, 40, 58].includes(qNum)) return 'Author’s Purpose / Tone (จุดประสงค์ผู้เขียน)';
  if ([18, 29, 31, 38, 39, 44, 52, 53].includes(qNum)) return 'Inference & Deduction (การอนุมาน)';
  return 'Detail & Scanning (รายละเอียดเฉพาะจุด)';
}

// Build flat lookup table of all 58 questions
const flatQuestions = [];
EXAM_DATA.sections.forEach((sec, sIdx) => {
  sec.questions.forEach((q) => {
    flatQuestions.push({
      ...q,
      sectionIndex: sIdx,
      sectionId: sec.id,
      sectionTitle: sec.title,
      sectionSubtitle: sec.subtitle,
      passage: sec.passage,
      passageTh: sec.passageTh || '',
      category: getQuestionType(q.num)
    });
  });
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  initThemeAndFont();
  initSectionDropdown();
  startTimer();
  renderApp();
  renderQuickStrip();
  renderTips();
  renderVocabList();
  setupKeyboardShortcuts();
  lucide.createIcons();
});

// Load state from localStorage
function loadSavedState() {
  try {
    const saved = localStorage.getItem('cutep_reading_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.userAnswers) state.userAnswers = parsed.userAnswers;
      if (parsed.flaggedQuestions) state.flaggedQuestions = new Set(parsed.flaggedQuestions);
      if (parsed.currentQuestionNum) state.currentQuestionNum = parsed.currentQuestionNum;
      if (parsed.appMode) state.appMode = parsed.appMode;
      if (parsed.isSubmitted) state.isSubmitted = parsed.isSubmitted;
      if (parsed.timerSeconds && !parsed.isSubmitted) state.timerSeconds = parsed.timerSeconds;
      if (typeof parsed.soundEnabled === 'boolean') state.soundEnabled = parsed.soundEnabled;
    }
  } catch (e) {
    console.error('Failed to load state from localStorage', e);
  }
}

// Save state to localStorage
function saveState() {
  try {
    const toSave = {
      userAnswers: state.userAnswers,
      flaggedQuestions: Array.from(state.flaggedQuestions),
      currentQuestionNum: state.currentQuestionNum,
      appMode: state.appMode,
      isSubmitted: state.isSubmitted,
      timerSeconds: state.timerSeconds,
      soundEnabled: state.soundEnabled
    };
    localStorage.setItem('cutep_reading_state', JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save state to localStorage', e);
  }
}

// Reset all answers
function resetAllAnswers() {
  if (confirm('คุณต้องการล้างคำตอบและเริ่มทำข้อสอบใหม่ทั้งหมดหรือไม่?')) {
    state.userAnswers = {};
    state.flaggedQuestions.clear();
    state.isSubmitted = false;
    state.timerSeconds = 70 * 60;
    state.currentQuestionNum = 1;
    saveState();
    closeModal('modalAnswerSheet');
    closeModal('modalScore');
    startTimer();
    renderApp();
    showToast('ล้างคำตอบและเริ่มทำใหม่เรียบร้อยแล้ว');
  }
}

// --- SOUND SYNTHESIZER (100% Offline Web Audio API) ---
function playFeedbackSound(isCorrect) {
  if (!state.soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isCorrect) {
      // Pleasant high double chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Gentle soft low blip
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    }
  } catch (e) {
    // Ignore audio errors if blocked by browser policy
  }
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  const icon = document.getElementById('soundIcon');
  if (state.soundEnabled) {
    icon.setAttribute('data-lucide', 'volume-2');
    showToast('เปิดเสียงเอฟเฟกต์ตอบข้อสอบแล้ว');
  } else {
    icon.setAttribute('data-lucide', 'volume-x');
    showToast('ปิดเสียงเอฟเฟกต์แล้ว');
  }
  lucide.createIcons();
  saveState();
}

// --- NAVIGATION & SECTION SELECTOR ---
function initSectionDropdown() {
  const select = document.getElementById('sectionSelect');
  select.innerHTML = '';
  EXAM_DATA.sections.forEach((sec, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${sec.title}: ${sec.subtitle}`;
    select.appendChild(opt);
  });
}

function switchSection(secIndex) {
  secIndex = parseInt(secIndex);
  state.currentSectionIndex = secIndex;
  const firstQ = EXAM_DATA.sections[secIndex].questions[0];
  state.currentQuestionNum = firstQ.num;
  renderApp();
}

function goToQuestion(qNum) {
  state.currentQuestionNum = qNum;
  const qData = flatQuestions.find(q => q.num === qNum);
  if (qData) {
    state.currentSectionIndex = qData.sectionIndex;
  }
  renderApp();
  closeModal('modalAnswerSheet');
}

function nextQuestion() {
  const currentIdx = flatQuestions.findIndex(q => q.num === state.currentQuestionNum);
  if (currentIdx < flatQuestions.length - 1) {
    const nextQ = flatQuestions[currentIdx + 1];
    state.currentQuestionNum = nextQ.num;
    state.currentSectionIndex = nextQ.sectionIndex;
    renderApp();
  } else {
    showToast('คุณอยู่ที่ข้อสุดท้าย (ข้อ 58) แล้ว');
  }
}

function prevQuestion() {
  const currentIdx = flatQuestions.findIndex(q => q.num === state.currentQuestionNum);
  if (currentIdx > 0) {
    const prevQ = flatQuestions[currentIdx - 1];
    state.currentQuestionNum = prevQ.num;
    state.currentSectionIndex = prevQ.sectionIndex;
    renderApp();
  }
}

// --- APP MODES ---
function setAppMode(mode) {
  state.appMode = mode;
  const btnExam = document.getElementById('btnModeExam');
  const btnPractice = document.getElementById('btnModePractice');

  if (mode === 'exam') {
    btnExam.className = 'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400';
    btnPractice.className = 'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900';
    document.getElementById('timerWidget').classList.remove('opacity-40');
    showToast('เปลี่ยนเป็น: โหมดสอบจริง (จับเวลา 70 นาที)');
  } else {
    btnPractice.className = 'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 bg-white text-emerald-600 shadow-xs dark:bg-slate-700 dark:text-emerald-400';
    btnExam.className = 'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900';
    document.getElementById('timerWidget').classList.add('opacity-40');
    showToast('เปลี่ยนเป็น: โหมดฝึกซ้อม (แสดงเฉลยทันที)');
  }

  saveState();
  renderApp();
}

// --- MOBILE SEGMENTED VIEW ---
function setMobileView(view) {
  state.mobileView = view;
  const panePassage = document.getElementById('panePassage');
  const paneQuestion = document.getElementById('paneQuestion');
  const tabBtnPassage = document.getElementById('tabBtnPassage');
  const tabBtnQuestion = document.getElementById('tabBtnQuestion');

  if (view === 'passage') {
    panePassage.classList.remove('hidden');
    paneQuestion.classList.add('hidden');
    tabBtnPassage.className = 'w-1/2 py-2 text-center rounded-xl transition-all bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400 flex items-center justify-center gap-1.5';
    tabBtnQuestion.className = 'w-1/2 py-2 text-center rounded-xl transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 flex items-center justify-center gap-1.5';
  } else {
    paneQuestion.classList.remove('hidden');
    panePassage.classList.add('hidden');
    tabBtnQuestion.className = 'w-1/2 py-2 text-center rounded-xl transition-all bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400 flex items-center justify-center gap-1.5';
    tabBtnPassage.className = 'w-1/2 py-2 text-center rounded-xl transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 flex items-center justify-center gap-1.5';
  }
  lucide.createIcons();
}

// --- THAI TRANSLATION TOGGLE ---
function toggleThaiTranslation() {
  state.showThaiTranslation = !state.showThaiTranslation;
  const btn = document.getElementById('btnToggleThai');
  const text = document.getElementById('thaiToggleText');

  if (state.showThaiTranslation) {
    btn.className = 'px-3 py-1.5 rounded-xl border border-emerald-500 bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all';
    text.textContent = '🇹🇭 ซ่อนคำแปลไทย';
    showToast('แสดงคำแปลภาษาไทยคู่ขนานในบทอ่าน');
  } else {
    btn.className = 'px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition-all shadow-2xs';
    text.textContent = '🇹🇭 แปลไทยทั้งบทความ';
    showToast('ซ่อนคำแปลภาษาไทยแล้ว');
  }

  const qData = flatQuestions.find(q => q.num === state.currentQuestionNum);
  const section = EXAM_DATA.sections[qData.sectionIndex];
  renderPassage(section, qData);
}

// --- SEARCH IN PASSAGE ---
function searchInPassage(keyword) {
  state.searchKeyword = keyword.trim();
  const clearBtn = document.getElementById('btnSearchClear');
  if (state.searchKeyword.length > 0) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }

  const qData = flatQuestions.find(q => q.num === state.currentQuestionNum);
  const section = EXAM_DATA.sections[qData.sectionIndex];
  renderPassage(section, qData);
}

function clearPassageSearch() {
  const input = document.getElementById('passageSearchInput');
  input.value = '';
  searchInPassage('');
}

// --- HORIZONTAL QUICK QUESTION STRIP ---
function renderQuickStrip() {
  const container = document.getElementById('quickStripContainer');
  if (!container) return;
  container.innerHTML = '';

  flatQuestions.forEach((q) => {
    const isAnswered = Boolean(state.userAnswers[q.num]);
    const isFlagged = state.flaggedQuestions.has(q.num);
    const isActive = state.currentQuestionNum === q.num;

    const pill = document.createElement('button');
    let pillClass = 'q-strip-pill ';

    if (state.isSubmitted) {
      const isCorrect = state.userAnswers[q.num]?.toUpperCase() === q.correct.toUpperCase();
      pillClass += isCorrect ? 'correct ' : 'incorrect ';
    } else if (isActive) {
      pillClass += 'active ';
    } else if (isAnswered) {
      pillClass += 'answered ';
    }

    if (isFlagged) {
      pillClass += 'flagged ';
    }

    pill.className = pillClass;
    pill.textContent = q.num;
    pill.id = `pill-q-${q.num}`;
    pill.title = `ข้อที่ ${q.num} (${q.category})`;
    pill.onclick = () => goToQuestion(q.num);

    container.appendChild(pill);
  });

  // Auto-scroll the active pill into view smoothly
  const activePill = document.getElementById(`pill-q-${state.currentQuestionNum}`);
  if (activePill) {
    activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  // Update strip progress text
  const answeredCount = Object.keys(state.userAnswers).length;
  const progressText = document.getElementById('stripProgressText');
  if (progressText) {
    progressText.textContent = `ตอบแล้ว ${answeredCount} / 58 ข้อ`;
  }
}

// --- RENDERING MAIN INTERFACE ---
function renderApp() {
  const qData = flatQuestions.find(q => q.num === state.currentQuestionNum) || flatQuestions[0];
  const section = EXAM_DATA.sections[qData.sectionIndex];
  state.currentSectionIndex = qData.sectionIndex;

  // Update Section Selector dropdown
  document.getElementById('sectionSelect').value = state.currentSectionIndex;

  // Update Passage Pane Header
  document.getElementById('passageTag').textContent = section.title;
  document.getElementById('passageTitle').textContent = section.subtitle;
  const qRange = `${section.questions[0].num} - ${section.questions[section.questions.length - 1].num}`;
  document.getElementById('passageSubtitle').textContent = `คำถามข้อ ${qRange} (จำนวน ${section.questions.length} ข้อ)`;

  // Word count estimate
  const words = section.passage.trim().split(/\s+/).length;
  document.getElementById('wordCountBadge').textContent = `~${words} words`;

  // Render Passage Text with blank indicators if Cloze & Thai translation if toggled
  renderPassage(section, qData);

  // Update Question Pane Header & Prompt
  document.getElementById('currentQuestionNum').textContent = qData.num;
  document.getElementById('mobileCurrentQBadge').textContent = qData.num;
  document.getElementById('questionPrompt').textContent = qData.prompt;
  document.getElementById('questionTypeBadge').textContent = qData.category;

  // Update Flag Button
  const isFlagged = state.flaggedQuestions.has(qData.num);
  const flagBtn = document.getElementById('btnFlag');
  const flagIcon = document.getElementById('flagIcon');
  const flagText = document.getElementById('flagText');
  if (isFlagged) {
    flagBtn.className = 'px-3 py-1.5 rounded-xl border border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 transition-all text-xs font-semibold flex items-center gap-1.5';
    flagIcon.className = 'w-3.5 h-3.5 text-amber-500 fill-amber-500';
    flagText.textContent = 'ปักหมุดแล้ว';
  } else {
    flagBtn.className = 'px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 text-slate-600 dark:text-slate-300 hover:text-amber-600 transition-all text-xs font-semibold flex items-center gap-1.5';
    flagIcon.className = 'w-3.5 h-3.5 text-slate-400';
    flagText.textContent = 'ปักหมุดทบทวน';
  }

  // Render Options
  renderOptions(qData);

  // Practice / Review Explanation Card
  renderExplanation(qData);

  // Update Navigation buttons
  const currentIdx = flatQuestions.findIndex(q => q.num === state.currentQuestionNum);
  document.getElementById('btnPrev').disabled = currentIdx === 0;
  document.getElementById('btnNext').disabled = currentIdx === flatQuestions.length - 1;

  // Update Answered Badge in Header
  const answeredCount = Object.keys(state.userAnswers).length;
  document.getElementById('answeredBadge').textContent = `${answeredCount}/58`;

  // Refresh Quick Strip
  renderQuickStrip();

  saveState();
  lucide.createIcons();
}

function renderPassage(section, currentQ) {
  const container = document.getElementById('passageContainer');

  // Split English passage into paragraphs
  const enParagraphs = section.passage.split('\n\n');
  const thParagraphs = section.passageTh ? section.passageTh.split('\n\n') : [];

  let formattedHtml = '';

  enParagraphs.forEach((pText, pIdx) => {
    let pFormatted = pText.trim();

    // If Cloze test (Section 1), dynamically insert user-selected words into blanks!
    if (section.id === 'sec-cloze') {
      pFormatted = pFormatted.replace(/\[(\d+)\]/g, (match, numStr) => {
        const num = parseInt(numStr);
        const isCurrent = num === currentQ.num;
        const selectedKey = state.userAnswers[num];
        
        // Find selected word text from options
        let wordDisplay = '____';
        if (selectedKey) {
          const qObj = section.questions.find(q => q.num === num);
          if (qObj) {
            const optObj = qObj.options.find(o => o.key.toUpperCase() === selectedKey.toUpperCase());
            if (optObj) wordDisplay = `<strong>${optObj.text}</strong>`;
          }
        }

        let blankStyle = 'cloze-blank-tag ';
        if (isCurrent) {
          blankStyle += 'bg-blue-600 text-white font-extrabold ring-4 ring-blue-300 dark:ring-blue-800 shadow-sm';
        } else if (selectedKey) {
          blankStyle += 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-400/40';
        } else {
          blankStyle += 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-400/40';
        }

        return `<span onclick="goToQuestion(${num})" class="${blankStyle}" title="คลิกเพื่อทำข้อ [${num}]">[${num}] ${wordDisplay}</span>`;
      });
    }

    // Apply keyword search highlighting if user searched
    if (state.searchKeyword.length >= 2) {
      const regex = new RegExp(`(${state.searchKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      pFormatted = pFormatted.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    formattedHtml += `<p class="mb-3">${pFormatted}</p>`;

    // If Thai Translation is enabled, insert corresponding Thai translation
    if (state.showThaiTranslation && thParagraphs[pIdx]) {
      formattedHtml += `
        <div class="mb-4 p-3 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 font-normal leading-relaxed">
          <span class="font-bold text-emerald-700 dark:text-emerald-400 mr-1.5">[แปลไทย]:</span>
          ${thParagraphs[pIdx]}
        </div>
      `;
    }
  });

  container.innerHTML = formattedHtml;
}

function renderOptions(qData) {
  const container = document.getElementById('optionsList');
  container.innerHTML = '';

  const selectedAnswer = state.userAnswers[qData.num];
  const isPracticeMode = state.appMode === 'practice';
  const showFeedback = (isPracticeMode && selectedAnswer) || state.isSubmitted;

  qData.options.forEach((opt) => {
    const isSelected = selectedAnswer === opt.key;
    const isCorrect = qData.correct.toUpperCase() === opt.key.toUpperCase();

    const optBtn = document.createElement('div');
    let classes = 'option-item p-3.5 sm:p-4 rounded-2xl flex items-start gap-3 bg-white dark:bg-slate-800/80 shadow-2xs ';

    if (showFeedback) {
      if (isCorrect) {
        classes += 'correct-answer ';
      } else if (isSelected && !isCorrect) {
        classes += 'wrong-answer ';
      }
    } else if (isSelected) {
      classes += 'selected ';
    }

    optBtn.className = classes;
    optBtn.onclick = () => selectOption(qData.num, opt.key);

    // Key badge (A, B, C, D)
    let keyBadgeClass = 'w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ';
    if (showFeedback) {
      if (isCorrect) {
        keyBadgeClass += 'bg-emerald-600 text-white';
      } else if (isSelected && !isCorrect) {
        keyBadgeClass += 'bg-red-600 text-white';
      } else {
        keyBadgeClass += 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
      }
    } else if (isSelected) {
      keyBadgeClass += 'bg-blue-600 text-white';
    } else {
      keyBadgeClass += 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }

    optBtn.innerHTML = `
      <div class="${keyBadgeClass}">${opt.key}</div>
      <div class="flex-1 text-sm sm:text-base font-medium text-slate-800 dark:text-slate-200 pt-0.5">
        ${opt.text}
      </div>
      ${showFeedback && isCorrect ? `<i data-lucide="check" class="w-5 h-5 text-emerald-600 shrink-0"></i>` : ''}
      ${showFeedback && isSelected && !isCorrect ? `<i data-lucide="x" class="w-5 h-5 text-red-600 shrink-0"></i>` : ''}
    `;

    container.appendChild(optBtn);
  });
}

function renderExplanation(qData) {
  const card = document.getElementById('practiceExplanationCard');
  const selectedAnswer = state.userAnswers[qData.num];
  const isPracticeMode = state.appMode === 'practice';
  const shouldShow = (isPracticeMode && selectedAnswer) || state.isSubmitted;

  if (shouldShow) {
    card.classList.remove('hidden');
    document.getElementById('correctChoiceBadge').textContent = `คำตอบที่ถูกต้อง: ${qData.correct}`;
    document.getElementById('explanationText').textContent = qData.explanation;
  } else {
    card.classList.add('hidden');
  }
}

// User selects an option
function selectOption(qNum, key) {
  state.userAnswers[qNum] = key;
  const qData = flatQuestions.find(q => q.num === qNum);
  const isCorrect = qData && qData.correct.toUpperCase() === key.toUpperCase();

  // Play audio feedback
  if (state.appMode === 'practice') {
    playFeedbackSound(isCorrect);
    if (isCorrect) {
      showToast(`ถูกต้อง! ข้อ ${qNum} ตอบ (${key})`);
    } else {
      showToast(`ยังไม่ถูก ข้อ ${qNum} เฉลยคือ (${qData.correct})`);
    }
  }

  renderApp();
}

// Toggle Flag
function toggleCurrentFlag() {
  if (state.flaggedQuestions.has(state.currentQuestionNum)) {
    state.flaggedQuestions.delete(state.currentQuestionNum);
    showToast(`ยกเลิกปักหมุดข้อ ${state.currentQuestionNum}`);
  } else {
    state.flaggedQuestions.add(state.currentQuestionNum);
    showToast(`ปักหมุดข้อ ${state.currentQuestionNum} เพื่อทบทวน`);
  }
  renderApp();
}

// --- TIMER ENGINE ---
function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (state.timerRunning && state.appMode === 'exam' && !state.isSubmitted) {
      if (state.timerSeconds > 0) {
        state.timerSeconds--;
        updateTimerDisplay();
      } else {
        clearInterval(state.timerInterval);
        alert('หมดเวลาสอบ 70 นาทีแล้ว! ระบบจะสรุปผลคะแนนให้คุณโดยอัตโนมัติ');
        submitExam();
      }
    }
  }, 1000);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const el = document.getElementById('timerDisplay');
  el.textContent = display;

  if (state.timerSeconds <= 5 * 60) {
    el.classList.add('timer-urgent');
  } else {
    el.classList.remove('timer-urgent');
  }
}

function toggleTimer() {
  state.timerRunning = !state.timerRunning;
  const icon = document.getElementById('timerIcon');
  if (state.timerRunning) {
    icon.setAttribute('data-lucide', 'pause');
    showToast('เริ่มนับเวลาต่อ');
  } else {
    icon.setAttribute('data-lucide', 'play');
    showToast('หยุดเวลาชั่วคราว');
  }
  lucide.createIcons();
}

// --- HIGHLIGHTER FEATURE ---
function applyHighlight(color) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    showToast('กรุณาลากเมาส์คลุมข้อความใน Passage ก่อนกดปุ่มไฮไลต์');
    return;
  }

  const range = selection.getRangeAt(0);
  const mark = document.createElement('mark');
  mark.className = `highlight-${color}`;
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
  selection.removeAllRanges();

  // Save highlight state for this section
  const section = EXAM_DATA.sections[state.currentSectionIndex];
  state.highlights[section.id] = document.getElementById('passageContainer').innerHTML;
  showToast('เน้นข้อความเรียบร้อย');
}

function clearHighlights() {
  const section = EXAM_DATA.sections[state.currentSectionIndex];
  delete state.highlights[section.id];
  const qData = flatQuestions.find(q => q.num === state.currentQuestionNum);
  renderPassage(section, qData);
  showToast('ล้างไฮไลต์ในหน้านี้เรียบร้อย');
}

// --- APPEARANCE & THEME ---
function initThemeAndFont() {
  const savedTheme = localStorage.getItem('cutep_theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  state.currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cutep_theme', theme);
  hideAppearanceDropdown();
}

function toggleAppearanceDropdown() {
  const menu = document.getElementById('appearanceMenu');
  menu.classList.toggle('hidden');
}

function hideAppearanceDropdown() {
  const menu = document.getElementById('appearanceMenu');
  if (menu) menu.classList.add('hidden');
}

function adjustFontSize(delta) {
  state.fontSizeOffset = Math.max(-1, Math.min(2, state.fontSizeOffset + delta));
  const sizes = ['0.95rem', '1.05rem', '1.18rem', '1.3rem'];
  const baseIdx = state.fontSizeOffset + 1;
  document.documentElement.style.setProperty('--passage-font-size', sizes[baseIdx]);
}

function resetFontSize() {
  state.fontSizeOffset = 0;
  document.documentElement.style.setProperty('--passage-font-size', '1.05rem');
}

// --- ANSWER SHEET MODAL ---
function renderAnswerSheetGrid() {
  const gridContainer = document.getElementById('answerSheetGrid');
  gridContainer.innerHTML = '';

  EXAM_DATA.sections.forEach((sec) => {
    const secBox = document.createElement('div');
    secBox.className = 'space-y-1.5';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1';
    header.innerHTML = `
      <span>${sec.title}</span>
      <span class="font-normal text-slate-400">${sec.subtitle}</span>
    `;
    secBox.appendChild(header);

    const bubblesWrap = document.createElement('div');
    bubblesWrap.className = 'flex flex-wrap gap-2 pt-1';

    sec.questions.forEach((q) => {
      const bubble = document.createElement('button');
      const isAnswered = Boolean(state.userAnswers[q.num]);
      const isFlagged = state.flaggedQuestions.has(q.num);
      const isActive = state.currentQuestionNum === q.num;

      let bubbleClass = 'q-bubble ';
      if (state.isSubmitted) {
        const isCorrect = state.userAnswers[q.num]?.toUpperCase() === q.correct.toUpperCase();
        bubbleClass += isCorrect ? 'correct ' : 'incorrect ';
      } else if (isActive) {
        bubbleClass += 'active ';
      } else if (isAnswered) {
        bubbleClass += 'answered ';
      }

      if (isFlagged) bubbleClass += 'flagged ';

      bubble.className = bubbleClass;
      bubble.textContent = q.num;
      bubble.title = `ข้อที่ ${q.num}: ${isAnswered ? `ตอบ ${state.userAnswers[q.num]}` : 'ยังไม่ตอบ'}`;
      bubble.onclick = () => goToQuestion(q.num);

      bubblesWrap.appendChild(bubble);
    });

    secBox.appendChild(bubblesWrap);
    gridContainer.appendChild(secBox);
  });
}

// --- VOCABULARY BANK & TEXT-TO-SPEECH ---
function renderVocabList() {
  const container = document.getElementById('vocabContainer');
  const search = (document.getElementById('vocabSearch')?.value || '').toLowerCase();
  container.innerHTML = '';

  const filtered = EXAM_DATA.vocabList.filter(v => 
    v.word.toLowerCase().includes(search) || 
    v.meaning.toLowerCase().includes(search) ||
    v.passage.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-2 text-center py-10 text-slate-400 text-sm">ไม่พบคำศัพท์ที่ตรงกับคำค้นหา</div>`;
    return;
  }

  filtered.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-50 dark:bg-slate-800/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between hover:shadow-md transition-shadow';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <h4 class="text-base font-extrabold text-blue-600 dark:text-blue-400">${v.word}</h4>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">${v.partOfSpeech}</span>
          </div>
          <button onclick="speakWord('${v.word}')" title="ฟังการออกเสียง" class="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors">
            <i data-lucide="volume-2" class="w-4 h-4"></i>
          </button>
        </div>
        <p class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">${v.meaning}</p>
        <p class="text-xs text-slate-600 dark:text-slate-400 italic mb-2">"${v.example}"</p>
      </div>
      <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
        <span>คำพ้อง: <strong class="text-slate-600 dark:text-slate-300">${v.synonyms}</strong></span>
        <span class="truncate max-w-[130px] text-right font-medium">${v.passage}</span>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

function speakWord(word) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } else {
    showToast('บราวเซอร์ของคุณไม่รองรับการออกเสียง');
  }
}

// --- CHULATUTOR TIPS ---
function renderTips() {
  const container = document.getElementById('tipsContainer');
  container.innerHTML = '';

  EXAM_DATA.tips.forEach((tip, idx) => {
    const item = document.createElement('div');
    item.className = 'bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 flex gap-3';
    item.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
        ${idx + 1}
      </div>
      <div>
        <h4 class="text-sm font-bold text-amber-900 dark:text-amber-300">${tip.title}</h4>
        <p class="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">${tip.description}</p>
      </div>
    `;
    container.appendChild(item);
  });
}

// --- SUBMIT EXAM & SCORE CALCULATION ---
function confirmSubmitExam() {
  const answeredCount = Object.keys(state.userAnswers).length;
  const remaining = 58 - answeredCount;

  let msg = `คุณทำข้อสอบไปแล้ว ${answeredCount} จากทั้งหมด 58 ข้อ`;
  if (remaining > 0) {
    msg += `\n(ยังมีข้อที่ยังไม่ได้ตอบอีก ${remaining} ข้อ)`;
  }
  msg += `\n\nยืนยันที่จะส่งข้อสอบและดูผลการประเมินหรือไม่?`;

  if (confirm(msg)) {
    submitExam();
  }
}

function submitExam() {
  state.isSubmitted = true;
  saveState();

  // Calculate score
  let correctCount = 0;
  const sectionBreakdown = EXAM_DATA.sections.map(sec => {
    let secCorrect = 0;
    sec.questions.forEach(q => {
      const userAns = state.userAnswers[q.num];
      if (userAns && userAns.toUpperCase() === q.correct.toUpperCase()) {
        secCorrect++;
        correctCount++;
      }
    });
    return {
      title: sec.title,
      subtitle: sec.subtitle,
      total: sec.questions.length,
      correct: secCorrect,
      pct: Math.round((secCorrect / sec.questions.length) * 100)
    };
  });

  const percentage = Math.round((correctCount / 58) * 100);

  // Update Score Modal UI
  document.getElementById('finalScoreVal').textContent = correctCount;
  document.getElementById('finalPercentageVal').textContent = `${percentage}%`;

  const badgeEl = document.getElementById('finalLevelBadge');
  const adviceEl = document.getElementById('diagnosticAdvice');

  if (correctCount >= 48) {
    badgeEl.textContent = 'ยอดเยี่ยม! (คะแนน 500+ / CEFR C1)';
    badgeEl.className = 'text-xs sm:text-sm font-extrabold mt-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 shadow-sm';
    adviceEl.textContent = 'ทักษะการอ่านของคุณอยู่ในระดับสูงมาก สามารถจับใจความ Main Idea และแยกแยะข้อมูลเฉพาะจุดได้อย่างแม่นยำ ข้อสอบจริงสามารถทำคะแนนพาร์ท Reading ได้เกิน 50/60 อย่างแน่นอน แนะนำให้ฝึกรักษาความเร็วและสมาธิ';
  } else if (correctCount >= 36) {
    badgeEl.textContent = 'ดี (คะแนน 400 - 480 / CEFR B2)';
    badgeEl.className = 'text-xs sm:text-sm font-extrabold mt-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 shadow-sm';
    adviceEl.textContent = 'ความสามารถในการอ่านโดยรวมดีมาก แต่ยังมีข้อผิดพลาดในข้อประเภท Inference (การอนุมาน) และคำถามเรื่อง Tone หรือคำศัพท์บริบท ให้ระวังตัวเลือกหลอก (Distractors) ที่นำศัพท์ในเรื่องมาสลับความหมาย';
  } else {
    badgeEl.textContent = 'ควรพัฒนาเพิ่ม (ต้องเสริมคำศัพท์ & Skimming)';
    badgeEl.className = 'text-xs sm:text-sm font-extrabold mt-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 shadow-sm';
    adviceEl.textContent = 'แนะนำให้เน้นท่องคลังคำศัพท์วิชาการในแท็บ "คำศัพท์" เพิ่มเติม และฝึกใช้เทคนิค Skimming อ่านหัวเรื่อง/ประโยคแรกของย่อหน้าเพื่อจับ Main Idea ให้เร็วกว่าเดิม รวมทั้งหลีกเลี่ยงการแปลทุกคำแบบ Word-by-Word';
  }

  // Section breakdown bars
  const breakdownContainer = document.getElementById('sectionBreakdownContainer');
  breakdownContainer.innerHTML = '';
  sectionBreakdown.forEach(b => {
    const row = document.createElement('div');
    row.className = 'bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700';
    row.innerHTML = `
      <div class="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
        <span>${b.title} <span class="text-slate-400 font-normal">(${b.subtitle})</span></span>
        <span>${b.correct} / ${b.total} (${b.pct}%)</span>
      </div>
      <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
        <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${b.pct}%"></div>
      </div>
    `;
    breakdownContainer.appendChild(row);
  });

  openModal('modalScore');
  renderApp();
}

function retakeExam() {
  resetAllAnswers();
}

function reviewAllAnswers() {
  closeModal('modalScore');
  state.appMode = 'practice';
  setAppMode('practice');
  goToQuestion(1);
  showToast('เข้าสู่โหมดตรวจเฉลยละเอียดทุกข้อ');
}

function reviewWrongAnswersOnly() {
  closeModal('modalScore');
  state.appMode = 'practice';
  setAppMode('practice');
  
  // Find first wrong answer
  const firstWrong = flatQuestions.find(q => {
    const ans = state.userAnswers[q.num];
    return !ans || ans.toUpperCase() !== q.correct.toUpperCase();
  });

  if (firstWrong) {
    goToQuestion(firstWrong.num);
    showToast(`กระโดดไปยังข้อ ${firstWrong.num} ที่ตอบผิด`);
  } else {
    showToast('ยินดีด้วย! คุณตอบถูกทุกข้อ');
    goToQuestion(1);
  }
}

// --- MODAL CONTROLLERS ---
function openModal(modalId) {
  hideAppearanceDropdown();
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.remove('hidden');
    if (modalId === 'modalAnswerSheet') {
      renderAnswerSheetGrid();
    }
  }
  lucide.createIcons();
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('hidden');
}

// --- TOAST NOTIFICATION ---
function showToast(message) {
  const existing = document.getElementById('appToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'appToast';
  toast.className = 'fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 animate-bounce';
  toast.innerHTML = `<i data-lucide="info" class="w-4 h-4 text-blue-400"></i> <span>${message}</span>`;
  document.body.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

// --- KEYBOARD SHORTCUTS ---
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(key)) {
      selectOption(state.currentQuestionNum, key);
    } else if (['1', '2', '3', '4'].includes(key)) {
      const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
      selectOption(state.currentQuestionNum, map[key]);
    } else if (e.key === 'ArrowRight' || key === 'N') {
      nextQuestion();
    } else if (e.key === 'ArrowLeft' || key === 'P') {
      prevQuestion();
    } else if (key === 'F') {
      toggleCurrentFlag();
    } else if (e.key === 'Escape') {
      ['modalAnswerSheet', 'modalVocab', 'modalTips', 'modalScore'].forEach(id => closeModal(id));
      hideAppearanceDropdown();
    }
  });

  window.addEventListener('click', (e) => {
    const btn = document.getElementById('btnAppearance');
    const menu = document.getElementById('appearanceMenu');
    if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
}
