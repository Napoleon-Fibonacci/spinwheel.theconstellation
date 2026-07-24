(function(){
  'use strict';

  // ---------- Constants ----------
  const STORAGE_KEYS = {
    master: 'spinwheel_master_list',
    active: 'spinwheel_active_options',
    history: 'spinwheel_history'
  };
  const SHADES = ['#111833', '#1E2A52', '#3D4A7A', '#182248', '#293868', '#4E5D95']; // deep→dusk family, more variety
  const STAR = '#EDEFF7';
  const MIN_SPIN_TURNS = 5;
  const MAX_SPIN_TURNS = 8;
  const SPIN_DURATION_MS = 5000;

  // ---------- DOM refs ----------
  const canvas = document.getElementById('wheelCanvas');
  const ctx = canvas.getContext('2d');
  const spinBtn = document.getElementById('spinBtn');
  const spinHint = document.getElementById('spinHint');
  const optionInput = document.getElementById('optionInput');
  const addBtn = document.getElementById('addBtn');
  const resetBtn = document.getElementById('resetBtn');
  const activeList = document.getElementById('activeList');
  const activeCount = document.getElementById('activeCount');
  const historyList = document.getElementById('historyList');
  const resultModal = document.getElementById('resultModal');
  const resultName = document.getElementById('resultName');
  const spinAgainBtn = document.getElementById('spinAgainBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const confettiBurst = document.getElementById('confettiBurst');
  const tickSound = document.getElementById('tickSound');
  const stopSound = document.getElementById('stopSound');

  // ---------- Canvas sizing (match actual display size incl. DPR) ----------
  let wheelSize = 600; // logical drawing size in CSS px, kept square
  function resizeCanvas(){
    const displaySize = canvas.clientWidth || canvas.parentElement.clientWidth;
    if(!displaySize) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    wheelSize = displaySize;
    canvas.width = Math.round(displaySize * dpr);
    canvas.height = Math.round(displaySize * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel();
  }
  window.addEventListener('resize', resizeCanvas);

  // ---------- State ----------
  let masterList = [];
  let activeOptions = [];
  let history = [];
  let currentRotation = 0; // radians
  let isSpinning = false;
  let lastTickSliceIndex = -1;

  // ---------- Storage helpers (fail-safe) ----------
  function safeGet(key){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch(e){ return null; }
  }
  function safeSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); } catch(e){ /* ignore, no persistence this session */ }
  }
  function safeRemove(key){
    try{ localStorage.removeItem(key); } catch(e){ /* ignore */ }
  }

  // ---------- Init ----------
  function init(){
    const storedMaster = safeGet(STORAGE_KEYS.master);
    const storedActive = safeGet(STORAGE_KEYS.active);
    const storedHistory = safeGet(STORAGE_KEYS.history);

    if(storedMaster && storedMaster.length){
      masterList = storedMaster;
      activeOptions = storedActive && storedActive.length ? storedActive : [...masterList];
      history = storedHistory || [];
    } else {
      masterList = [];
      activeOptions = [];
      history = [];
    }

    resizeCanvas();
    renderActiveList();
    renderHistory();
    updateSpinBtnState();
  }

  // ---------- Render ----------
  function renderAll(){
    renderActiveList();
    renderHistory();
    drawWheel();
    updateSpinBtnState();
  }

  function renderActiveList(){
    activeCount.textContent = `(${activeOptions.length})`;
    if(activeOptions.length === 0){
      activeList.innerHTML = '<div class="empty">Belum ada opsi aktif.</div>';
      return;
    }
    activeList.innerHTML = '';
    activeOptions.forEach((opt, i)=>{
      const row = document.createElement('div');
      row.className = 'active-item';
      row.innerHTML = `<span class="txt">${escapeHtml(opt)}</span><button class="remove-btn" data-i="${i}">✕</button>`;
      activeList.appendChild(row);
    });
    activeList.querySelectorAll('.remove-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(isSpinning) return;
        const idx = parseInt(btn.dataset.i, 10);
        activeOptions.splice(idx, 1);
        safeSet(STORAGE_KEYS.active, activeOptions);
        renderAll();
      });
    });
  }

  function renderHistory(){
    if(history.length === 0){
      historyList.innerHTML = '<div class="empty">Belum ada hasil spin.</div>';
      return;
    }
    historyList.innerHTML = '';
    history.forEach((h, i)=>{
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `<span class="txt">${escapeHtml(h)}</span><span class="num">#${i+1}</span>`;
      historyList.appendChild(row);
    });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateSpinBtnState(){
    const enough = activeOptions.length >= 2;
    spinBtn.disabled = !enough || isSpinning;
    spinHint.textContent = enough ? '' : 'Minimal 2 opsi untuk memutar wheel.';
  }

  let labelCache = { key: '', labels: [] };
  function getCachedLabels(){
    const key = wheelSize + '|' + activeOptions.join('\u0001');
    if(labelCache.key === key) return labelCache.labels;
    const n = activeOptions.length;
    const size = wheelSize;
    const r = size/2 - 4;
    const sliceAngle = (Math.PI*2) / n;
    const fontSize = n <= 3 ? 32 : n <= 6 ? 24 : n <= 10 ? 18 : n <= 16 ? 14 : n <= 24 ? 11 : 9;
    const maxLabelWidth = r - 40;
    const labels = activeOptions.map(opt => truncateLabel(opt, maxLabelWidth, ctx, fontSize));
    labelCache = { key, labels };
    return labels;
  }

  // ---------- Wheel drawing ----------
  function drawWheel(){
    const size = wheelSize;
    const cx = size/2, cy = size/2, r = size/2 - 4;
    ctx.clearRect(0,0,size,size);

    if(activeOptions.length === 0){
      ctx.fillStyle = SHADES[0];
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = STAR;
      ctx.font = "600 16px 'Space Grotesk', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tidak ada opsi', cx, cy);
      return;
    }

    const n = activeOptions.length;
    const sliceAngle = (Math.PI*2) / n;
    const fontSize = n <= 3 ? 32 : n <= 6 ? 24 : n <= 10 ? 18 : n <= 16 ? 14 : n <= 24 ? 11 : 9;
    const halfAngle = sliceAngle/2;
    const labelRadius = r * (2/3) * (Math.sin(halfAngle)/halfAngle);
    const labels = getCachedLabels();

    for(let i=0; i<n; i++){
      const start = currentRotation + i*sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      let shadeIdx = i % SHADES.length;
      if(i === n-1 && shadeIdx === 0 && n % SHADES.length === 0) shadeIdx = 1;
      ctx.fillStyle = SHADES[shadeIdx];
      ctx.fill();
      ctx.strokeStyle = 'rgba(237,239,247,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // label — centered radially within the slice, rotated to follow slice angle
      const mid = start + sliceAngle/2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = STAR;
      ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;
      ctx.fillText(labels[i], labelRadius, 0);
      ctx.restore();
    }

    // center hub
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI*2);
    ctx.fillStyle = STAR;
    ctx.fill();
  }

  function truncateLabel(text, maxWidth, context, fontSize){
    context.font = `500 ${fontSize}px 'Inter', sans-serif`;
    if(context.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while(truncated.length > 1 && context.measureText(truncated + '…').width > maxWidth){
      truncated = truncated.slice(0, -1);
    }
    return truncated + '…';
  }

  // ---------- Spin logic ----------
  function spin(){
    if(isSpinning || activeOptions.length < 2) return;
    isSpinning = true;
    updateSpinBtnState();

    const n = activeOptions.length;
    const sliceAngle = (Math.PI*2) / n;

    const turns = MIN_SPIN_TURNS + Math.random()*(MAX_SPIN_TURNS - MIN_SPIN_TURNS);
    const randomOffset = Math.random() * Math.PI*2;
    const totalRotation = turns * Math.PI*2 + randomOffset;

    const startRotation = currentRotation;
    const targetRotation = startRotation + totalRotation;
    const startTime = performance.now();
    lastTickSliceIndex = -1;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1000/60; // ponytail: simple delta-throttle, good enough vs a full frame scheduler

    function easeOutQuint(t){ return 1 - Math.pow(1-t, 5); }

    function frame(now){
      if(now - lastFrameTime < FRAME_INTERVAL){
        requestAnimationFrame(frame);
        return;
      }
      lastFrameTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / SPIN_DURATION_MS);
      const eased = easeOutQuint(t);
      currentRotation = startRotation + totalRotation*eased;

      drawWheel();
      maybePlayTick(sliceAngle);

      if(t < 1){
        requestAnimationFrame(frame);
      } else {
        currentRotation = normalizeAngle(startRotation + totalRotation);
        drawWheel();
        finishSpin();
      }
    }
    requestAnimationFrame(frame);
  }

  function normalizeAngle(a){
    const twoPi = Math.PI*2;
    return ((a % twoPi) + twoPi) % twoPi;
  }

  function maybePlayTick(sliceAngle){
    // pointer at top = angle -PI/2 in canvas space (0 = 3 o'clock, clockwise)
    const pointerAngle = normalizeAngle(-Math.PI/2 - currentRotation);
    const sliceIndex = Math.floor(pointerAngle / sliceAngle);
    if(sliceIndex !== lastTickSliceIndex){
      lastTickSliceIndex = sliceIndex;
      playSound(tickSound);
    }
  }

  function playSound(el){
    try{
      el.currentTime = 0;
      const p = el.play();
      if(p && p.catch) p.catch(()=>{ /* autoplay blocked or file missing, ignore */ });
    } catch(e){ /* fail-safe: animation continues without sound */ }
  }

  function finishSpin(){
    playSound(stopSound);
    const n = activeOptions.length;
    const sliceAngle = (Math.PI*2) / n;
    const pointerAngle = normalizeAngle(-Math.PI/2 - currentRotation);
    const winnerIndex = Math.floor(pointerAngle / sliceAngle) % n;
    const winner = activeOptions[winnerIndex];

    history.push(winner);
    safeSet(STORAGE_KEYS.history, history);
    renderHistory();

    isSpinning = false;
    updateSpinBtnState();

    resultName.textContent = winner;
    spawnConfetti();
    resultModal.classList.add('show');
  }

  function spawnConfetti(){
    confettiBurst.innerHTML = '';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion) return;
    const colors = ['#EDEFF7', '#8891B5', '#3D4A7A'];
    const count = 18;
    for(let i=0;i<count;i++){
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const angle = (Math.PI*2 * i/count) + (Math.random()*0.5-0.25);
      const dist = 70 + Math.random()*50;
      p.style.setProperty('--dx', Math.cos(angle)*dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle)*dist - 20 + 'px');
      p.style.setProperty('--rot', (Math.random()*360-180) + 'deg');
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random()*0.08) + 's';
      confettiBurst.appendChild(p);
    }
  }

  // ---------- Events ----------
  spinBtn.addEventListener('click', spin);
  canvas.addEventListener('click', spin);

  function addOption(){
    if(isSpinning) return;
    const val = optionInput.value.trim();
    if(!val) return;
    masterList.push(val);
    activeOptions.push(val);
    safeSet(STORAGE_KEYS.master, masterList);
    safeSet(STORAGE_KEYS.active, activeOptions);
    optionInput.value = '';
    optionInput.focus();
    renderAll();
  }
  addBtn.addEventListener('click', addOption);
  optionInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); addOption(); }
  });

  resetBtn.addEventListener('click', ()=>{
    if(isSpinning) return;
    if(!confirm('Reset semua? Semua opsi dan history akan dikosongkan.')) return;
    masterList = [];
    activeOptions = [];
    history = [];
    safeSet(STORAGE_KEYS.master, masterList);
    safeSet(STORAGE_KEYS.active, activeOptions);
    safeRemove(STORAGE_KEYS.history);
    currentRotation = 0;
    renderAll();
  });

  spinAgainBtn.addEventListener('click', ()=>{
    resultModal.classList.remove('show');
    spin();
  });
  closeModalBtn.addEventListener('click', ()=>{
    resultModal.classList.remove('show');
  });
  clearHistoryBtn.addEventListener('click', ()=>{
    if(history.length === 0) return;
    if(!confirm('Hapus semua history hasil spin?')) return;
    history = [];
    safeRemove(STORAGE_KEYS.history);
    renderHistory();
  });
  resultModal.addEventListener('click', (e)=>{
    if(e.target === resultModal) resultModal.classList.remove('show');
  });

  // ---------- Start ----------
  init();
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(drawWheel).catch(()=>{});
  }
})();