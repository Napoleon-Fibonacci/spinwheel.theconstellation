(function(){
  'use strict';

  // ---------- Constants ----------
  function storageKeys(i){
    return {
      master: 'spinwheel_master_list_' + i,
      active: 'spinwheel_active_options_' + i,
      history: 'spinwheel_history_' + i
    };
  }
  const WHEEL_COUNT_KEY = 'spinwheel_wheel_count';
  const MOBILE_BREAKPOINT = 768; // 2-wheel mode is tablet/desktop only
  const SHADES = ['#111833', '#1E2A52', '#3D4A7A', '#182248', '#293868', '#4E5D95'];
  const STAR = '#EDEFF7';
  const MIN_SPIN_TURNS = 5;
  const MAX_SPIN_TURNS = 8;
  const SPIN_DURATION_MS = 5000;
  const FRAME_INTERVAL = 1000/60;

  // ---------- Global DOM refs ----------
  const addWheelBtn = document.getElementById('addWheelBtn');
  const removeWheelBtn = document.getElementById('removeWheelBtn');
  const wheelsGrid = document.querySelector('.wheels-grid');
  const viewportMeta = document.getElementById('viewportMeta');
  const wheelCols = [document.getElementById('wheelCol0'), document.getElementById('wheelCol1')];
  const resultModal = document.getElementById('resultModal');
  const resultName = document.getElementById('resultName');
  const spinAgainBtn = document.getElementById('spinAgainBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const confettiBurst = document.getElementById('confettiBurst');
  const tickSound = document.getElementById('tickSound');
  const stopSound = document.getElementById('stopSound');

  // ---------- Storage helpers (fail-safe) ----------
  function safeGet(key){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch(e){ return null; }
  }
  function safeSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); } catch(e){ /* ignore */ }
  }
  function safeRemove(key){
    try{ localStorage.removeItem(key); } catch(e){ /* ignore */ }
  }

  // ---------- Per-wheel state + per-wheel DOM refs ----------
  let wheelCount = 1;
  let lastWinnerWheel = 0; // which wheel's result the modal is currently showing

  const W = [0, 1].map(i => {
    const col = wheelCols[i];
    return {
      i,
      col,
      canvas: col.querySelector('.wheelCanvas'),
      ctx: null,
      spinBtn: col.querySelector('.spinBtn'),
      spinHint: col.querySelector('.spinHint'),
      optionInput: col.querySelector('.optionInput'),
      addBtn: col.querySelector('.addBtn'),
      resetBtn: col.querySelector('.resetBtn'),
      activeList: col.querySelector('.activeList'),
      activeCount: col.querySelector('.activeCount'),
      historyList: col.querySelector('.historyList'),
      clearHistoryBtn: col.querySelector('.clearHistoryBtn'),
      master: [], active: [], history: [],
      rotation: 0,
      isSpinning: false,
      lastTickSliceIndex: -1,
      wheelSize: 600,
      labelCache: { key: '', labels: [] }
    };
  });
  W.forEach(w => { w.ctx = w.canvas.getContext('2d'); });

  // ---------- Canvas sizing ----------
  function resizeCanvas(w){
    const displaySize = w.canvas.clientWidth || w.canvas.parentElement.clientWidth;
    if(!displaySize) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w.wheelSize = displaySize;
    w.canvas.width = Math.round(displaySize * dpr);
    w.canvas.height = Math.round(displaySize * dpr);
    w.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel(w);
  }
  function applyResponsiveVisibility(){
    const showSecond = wheelCount >= 2 && !isMobile();
    wheelCols[1].hidden = !showSecond;
    addWheelBtn.hidden = showSecond || isMobile();
    updateGridLayout();
    updateZoomLock();
    if(showSecond) resizeCanvas(W[1]);
  }

  window.addEventListener('resize', ()=>{
    applyResponsiveVisibility();
    W.forEach(w => { if(!w.col.hidden) resizeCanvas(w); });
  });

  function isMobile(){
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function effectiveWheelCount(){
    return (wheelCount >= 2 && !isMobile()) ? 2 : 1;
  }

  function updateGridLayout(){
    wheelsGrid.classList.toggle('single', effectiveWheelCount() === 1);
  }

  function updateZoomLock(){
    if(effectiveWheelCount() >= 2){
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5, user-scalable=yes');
    } else {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no');
    }
  }

  // ---------- Init ----------
  function loadWheel(w){
    const keys = storageKeys(w.i);
    const storedMaster = safeGet(keys.master);
    const storedActive = safeGet(keys.active);
    const storedHistory = safeGet(keys.history);
    if(storedMaster && storedMaster.length){
      w.master = storedMaster;
      w.active = storedActive && storedActive.length ? storedActive : [...storedMaster];
      w.history = storedHistory || [];
    }
  }

  function init(){
    loadWheel(W[0]);
    loadWheel(W[1]);
    wheelCount = (safeGet(WHEEL_COUNT_KEY) === 2) ? 2 : 1;
    applyResponsiveVisibility();

    W.forEach(w => {
      if(w.col.hidden) return;
      resizeCanvas(w);
      renderActiveList(w);
      renderHistory(w);
      updateSpinBtnState(w);
    });
  }

  // ---------- Render ----------
  function renderAll(w){
    renderActiveList(w);
    renderHistory(w);
    drawWheel(w);
    updateSpinBtnState(w);
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderActiveList(w){
    w.activeCount.textContent = `(${w.active.length})`;
    if(w.active.length === 0){
      w.activeList.innerHTML = '<div class="empty">Belum ada opsi aktif.</div>';
      return;
    }
    w.activeList.innerHTML = '';
    w.active.forEach((opt, idx)=>{
      const row = document.createElement('div');
      row.className = 'active-item';
      row.innerHTML = `<span class="txt">${escapeHtml(opt)}</span><button class="remove-btn" data-i="${idx}">✕</button>`;
      w.activeList.appendChild(row);
    });
    w.activeList.querySelectorAll('.remove-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(w.isSpinning) return;
        const idx = parseInt(btn.dataset.i, 10);
        w.active.splice(idx, 1);
        safeSet(storageKeys(w.i).active, w.active);
        renderAll(w);
      });
    });
  }

  function renderHistory(w){
    if(w.history.length === 0){
      w.historyList.innerHTML = '<div class="empty">Belum ada hasil spin.</div>';
      return;
    }
    w.historyList.innerHTML = '';
    w.history.forEach((h, idx)=>{
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `<span class="txt">${escapeHtml(h)}</span><span class="num">#${idx+1}</span>`;
      w.historyList.appendChild(row);
    });
  }

  function updateSpinBtnState(w){
    const enough = w.active.length >= 2;
    w.spinBtn.disabled = !enough || w.isSpinning;
    w.spinHint.textContent = enough ? '' : 'Minimal 2 opsi untuk memutar wheel.';
  }

  // ---------- Label cache + drawing ----------
  function getCachedLabels(w){
    const key = w.wheelSize + '|' + w.active.join('\u0001');
    if(w.labelCache.key === key) return w.labelCache.labels;
    const n = w.active.length;
    const r = w.wheelSize/2 - 4;
    const fontSize = n <= 3 ? 32 : n <= 6 ? 24 : n <= 10 ? 18 : n <= 16 ? 14 : n <= 24 ? 11 : 9;
    const maxLabelWidth = r - 40;
    const labels = w.active.map(opt => truncateLabel(opt, maxLabelWidth, w.ctx, fontSize));
    w.labelCache = { key, labels };
    return labels;
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

  function drawWheel(w){
    const ctx = w.ctx;
    const size = w.wheelSize;
    const cx = size/2, cy = size/2, r = size/2 - 4;
    ctx.clearRect(0,0,size,size);

    if(w.active.length === 0){
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

    const n = w.active.length;
    const sliceAngle = (Math.PI*2) / n;
    const fontSize = n <= 3 ? 32 : n <= 6 ? 24 : n <= 10 ? 18 : n <= 16 ? 14 : n <= 24 ? 11 : 9;
    const halfAngle = sliceAngle/2;
    const labelRadius = r * (2/3) * (Math.sin(halfAngle)/halfAngle);
    const labels = getCachedLabels(w);

    for(let idx=0; idx<n; idx++){
      const start = w.rotation + idx*sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      let shadeIdx = idx % SHADES.length;
      if(idx === n-1 && shadeIdx === 0 && n % SHADES.length === 0) shadeIdx = 1;
      ctx.fillStyle = SHADES[shadeIdx];
      ctx.fill();
      ctx.strokeStyle = 'rgba(237,239,247,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const mid = start + sliceAngle/2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = STAR;
      ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;
      ctx.fillText(labels[idx], labelRadius, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI*2);
    ctx.fillStyle = STAR;
    ctx.fill();
  }

  function normalizeAngle(a){
    const twoPi = Math.PI*2;
    return ((a % twoPi) + twoPi) % twoPi;
  }

  function playSound(el){
    try{
      el.currentTime = 0;
      const p = el.play();
      if(p && p.catch) p.catch(()=>{});
    } catch(e){ /* fail-safe */ }
  }

  // ---------- Spin logic (independent per wheel) ----------
  function spin(w){
    if(w.isSpinning || w.active.length < 2) return;
    w.isSpinning = true;
    updateSpinBtnState(w);

    const n = w.active.length;
    const sliceAngle = (Math.PI*2) / n;
    const turns = MIN_SPIN_TURNS + Math.random()*(MAX_SPIN_TURNS - MIN_SPIN_TURNS);
    const randomOffset = Math.random() * Math.PI*2;
    const totalRotation = turns * Math.PI*2 + randomOffset;
    const startRotation = w.rotation;
    const startTime = performance.now();
    w.lastTickSliceIndex = -1;
    let lastFrameTime = 0;

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
      w.rotation = startRotation + totalRotation*eased;

      drawWheel(w);
      maybePlayTick(w, sliceAngle);

      if(t < 1){
        requestAnimationFrame(frame);
      } else {
        w.rotation = normalizeAngle(startRotation + totalRotation);
        drawWheel(w);
        finishSpin(w);
      }
    }
    requestAnimationFrame(frame);
  }

  function maybePlayTick(w, sliceAngle){
    const pointerAngle = normalizeAngle(-Math.PI/2 - w.rotation);
    const sliceIndex = Math.floor(pointerAngle / sliceAngle);
    if(sliceIndex !== w.lastTickSliceIndex){
      w.lastTickSliceIndex = sliceIndex;
      playSound(tickSound);
    }
  }

  function finishSpin(w){
    playSound(stopSound);
    const n = w.active.length;
    const sliceAngle = (Math.PI*2) / n;
    const pointerAngle = normalizeAngle(-Math.PI/2 - w.rotation);
    const winnerIndex = Math.floor(pointerAngle / sliceAngle) % n;
    const winner = w.active[winnerIndex];

    w.history.push(winner);
    safeSet(storageKeys(w.i).history, w.history);
    renderHistory(w);

    w.active.splice(winnerIndex, 1);
    safeSet(storageKeys(w.i).active, w.active);
    renderActiveList(w);
    drawWheel(w);

    w.isSpinning = false;
    updateSpinBtnState(w);

    lastWinnerWheel = w.i;
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
    for(let idx=0; idx<count; idx++){
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const angle = (Math.PI*2 * idx/count) + (Math.random()*0.5-0.25);
      const dist = 70 + Math.random()*50;
      p.style.setProperty('--dx', Math.cos(angle)*dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle)*dist - 20 + 'px');
      p.style.setProperty('--rot', (Math.random()*360-180) + 'deg');
      p.style.background = colors[idx % colors.length];
      p.style.animationDelay = (Math.random()*0.08) + 's';
      confettiBurst.appendChild(p);
    }
  }

  // ---------- Wire per-wheel events ----------
  W.forEach(w => {
    w.spinBtn.addEventListener('click', ()=>spin(w));
    w.canvas.addEventListener('click', ()=>spin(w));

    function addOption(){
      if(w.isSpinning) return;
      const val = w.optionInput.value.trim();
      if(!val) return;
      w.master.push(val);
      w.active.push(val);
      safeSet(storageKeys(w.i).master, w.master);
      safeSet(storageKeys(w.i).active, w.active);
      w.optionInput.value = '';
      w.optionInput.focus();
      renderAll(w);
    }
    w.addBtn.addEventListener('click', addOption);
    w.optionInput.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); addOption(); }
    });

    w.resetBtn.addEventListener('click', ()=>{
      if(w.isSpinning) return;
      if(!confirm('Reset semua? Semua opsi dan history akan dikosongkan.')) return;
      w.master = [];
      w.active = [];
      w.history = [];
      const keys = storageKeys(w.i);
      safeSet(keys.master, w.master);
      safeSet(keys.active, w.active);
      safeRemove(keys.history);
      w.rotation = 0;
      renderAll(w);
    });

    w.clearHistoryBtn.addEventListener('click', ()=>{
      if(w.history.length === 0) return;
      if(!confirm('Hapus semua history hasil spin?')) return;
      w.history = [];
      safeRemove(storageKeys(w.i).history);
      renderHistory(w);
    });
  });

  // ---------- Add second wheel ----------
  addWheelBtn.addEventListener('click', ()=>{
    if(wheelCount >= 2 || isMobile()) return;
    wheelCount = 2;
    safeSet(WHEEL_COUNT_KEY, 2);
    wheelCols[1].hidden = false;
    addWheelBtn.hidden = true;
    updateGridLayout();
    updateZoomLock();
    const w1 = W[1];
    resizeCanvas(w1);
    renderActiveList(w1);
    renderHistory(w1);
    updateSpinBtnState(w1);
  });

  // ---------- Remove second wheel ----------
  removeWheelBtn.addEventListener('click', ()=>{
    const w1 = W[1];
    if(w1.isSpinning) return;
    if(!confirm('Hapus Wheel 2? Semua opsi dan history di wheel ini akan hilang.')) return;
    w1.master = [];
    w1.active = [];
    w1.history = [];
    w1.rotation = 0;
    const keys = storageKeys(1);
    safeRemove(keys.master);
    safeRemove(keys.active);
    safeRemove(keys.history);
    wheelCount = 1;
    safeSet(WHEEL_COUNT_KEY, 1);
    wheelCols[1].hidden = true;
    addWheelBtn.hidden = false;
    updateGridLayout();
    updateZoomLock();
  });

  // ---------- Result modal ----------
  spinAgainBtn.addEventListener('click', ()=>{
    resultModal.classList.remove('show');
    spin(W[lastWinnerWheel]);
  });
  closeModalBtn.addEventListener('click', ()=>{
    resultModal.classList.remove('show');
  });
  resultModal.addEventListener('click', (e)=>{
    if(e.target === resultModal) resultModal.classList.remove('show');
  });

  // ---------- Start ----------
  init();
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{ W.forEach(w => { if(!w.col.hidden) drawWheel(w); }); }).catch(()=>{});
  }
})();
