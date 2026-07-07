/* ============================================================
   러비더비 랩 PoC
   1) AI 영상통화 — 브라우저 STT → /api/chat (Claude) → TTS
   2) AI 인생네컷 — 셀피 + AI 연인 합성 4컷 (Canvas, 온디바이스)
   ============================================================ */

// ---------- 데이터 ----------
// 캐릭터 이미지는 /api/img 프록시(같은 오리진)로 서빙 → 캔버스 CORS 안전
const PARTNERS = [
  {
    id: 'yuri', name: '유리', tag: '다정한 첫사랑 st.',
    persona: '밝고 다정하며 리액션이 큰 연인. 상대를 잘 챙기고 애교가 많다.',
    voiceGender: 'female',
    img: '/api/img?id=yuri',
  },
  {
    id: 'sena', name: '세나', tag: '츤데레 카리스마',
    persona: '겉은 시크하지만 속은 따뜻한 츤데레 연인. 짧고 직설적으로 말하다가 가끔 훅 다정해진다.',
    voiceGender: 'female',
    img: '/api/img?id=sena',
  },
  {
    id: 'jiho', name: '지호', tag: '스윗 다정남',
    persona: '차분하고 스윗한 연인. 상대의 하루를 궁금해하고 칭찬을 아끼지 않는다.',
    voiceGender: 'male',
    img: '/api/img?id=jiho',
  },
  {
    id: 'doyun', name: '도윤', tag: '장난기 소년미',
    persona: '유머러스하고 장난기 많은 연인. 농담을 잘 치지만 결정적인 순간엔 진심을 말한다.',
    voiceGender: 'male',
    img: '/api/img?id=doyun',
  },
];

const CONCEPTS = [
  { id: 'first-date', emoji: '🌸', name: '첫 데이트', cap: '설레는 파스텔 무드', bg: ['#ffd1e3', '#ffb3c8'], frame: '#fff', ink: '#c2255c', label: 'first date 💘' },
  { id: 'night-drive', emoji: '🌙', name: '심야 드라이브', cap: '시티팝 네온 나이트', bg: ['#2b2350', '#5b3b8c'], frame: '#171226', ink: '#c9b8ff', label: 'midnight drive 🌃' },
  { id: 'film', emoji: '🎞️', name: '필름 카메라', cap: '빈티지 그레인 감성', bg: ['#e8ddc7', '#cdbba0'], frame: '#3f3627', ink: '#5c4f38', label: 'on film, with you' },
  { id: 'xmas', emoji: '🎄', name: '크리스마스', cap: '연말 데이트 감성', bg: ['#0f3d2e', '#1d6647'], frame: '#0a2b21', ink: '#ffd6a5', label: 'merry us 🎁' },
];

// ---------- 상태 ----------
const state = {
  partner: null,
  from: 'landing',      // 파트너 선택 후 어디로 갈지: 'call' | 'foursnap'
  selfie: null,         // HTMLImageElement | null
  concept: CONCEPTS[0],
  chat: [],             // {role, content}
  callSec: 0,
  callTimerId: null,
  speaking: false,
  listening: false,
  userTurns: 0,
};

// ---------- 공통 유틸 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function show(screen) {
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s.dataset.screen === screen));
  window.scrollTo(0, 0);
}
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(t._id);
  t._id = setTimeout(() => t.classList.remove('is-on'), ms);
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ---------- 파트너 선택 ----------
function renderPartners() {
  const wrap = $('#partners');
  wrap.innerHTML = '';
  PARTNERS.forEach((p) => {
    const el = document.createElement('button');
    el.className = 'partner';
    el.innerHTML = `
      <img class="partner__img" src="${p.img}" alt="${p.name}" loading="lazy" />
      <div class="partner__meta">
        <div class="partner__name">${p.name}</div>
        <div class="partner__tag">${p.tag}</div>
      </div>`;
    el.addEventListener('click', () => {
      state.partner = p;
      $$('.partner').forEach((x) => x.classList.remove('is-selected'));
      el.classList.add('is-selected');
      $('#partnerNext').disabled = false;
    });
    wrap.appendChild(el);
  });
}

$('#partnerNext').addEventListener('click', () => {
  if (!state.partner) return;
  if (state.from === 'call') startCall();
  else { show('foursnap'); goStep('selfie'); }
});

// ---------- 영상통화 ----------
const captionsEl = $('#captions');

function addCaption(role, text) {
  const el = document.createElement('div');
  el.className = `cap cap--${role}`;
  el.textContent = text;
  captionsEl.appendChild(el);
  while (captionsEl.children.length > 6) captionsEl.removeChild(captionsEl.firstChild);
  captionsEl.scrollTop = captionsEl.scrollHeight;
  return el;
}

function pickVoice(gender) {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('ko'));
  if (!voices.length) return null;
  const female = voices.find((v) => /Yuna|SunHi|여성|Female|Heami/i.test(v.name));
  const male = voices.find((v) => /민준|InJoon|남성|Male/i.test(v.name));
  return (gender === 'male' ? male : female) || voices[0];
}

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    const v = pickVoice(state.partner?.voiceGender);
    if (v) u.voice = v;
    u.rate = 1.05;
    u.pitch = state.partner?.voiceGender === 'male' ? 0.95 : 1.1;
    state.speaking = true;
    $('#callVideo').classList.add('is-talking');
    u.onend = u.onerror = () => {
      state.speaking = false;
      $('#callVideo').classList.remove('is-talking');
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

async function sendToAI(text) {
  state.chat.push({ role: 'user', content: text });
  state.userTurns++;
  addCaption('user', text);
  $('#callStatus').textContent = '생각 중…';

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.chat,
        partner: { name: state.partner.name, persona: state.partner.persona },
      }),
    });
    const data = await r.json();
    const reply = data.reply || '잘 안 들렸어, 한 번만 더 말해 줄래?';
    state.chat.push({ role: 'assistant', content: reply });
    addCaption('ai', reply);
    $('#callStatus').textContent = '통화 중';
    if (state.userTurns >= 4 || /네컷/.test(reply)) $('#foursnapCta').hidden = false;
    await speak(reply);
  } catch (e) {
    $('#callStatus').textContent = '연결 불안정';
    addCaption('ai', '연결이 잠깐 끊겼어. 다시 말해 줄래?');
  }
}

// --- STT ---
let recognition = null;
function setupSTT() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    if (text) sendToAI(text);
  };
  rec.onend = () => {
    state.listening = false;
    $('#micBtn').classList.remove('is-live');
  };
  rec.onerror = () => {
    state.listening = false;
    $('#micBtn').classList.remove('is-live');
    toast('음성이 인식되지 않았어요. 다시 눌러보세요.');
  };
  return rec;
}

$('#micBtn').addEventListener('click', () => {
  if (!recognition) recognition = setupSTT();
  if (!recognition) return toast('이 브라우저는 음성 인식을 지원하지 않아요. 입력창을 사용해 주세요.');
  if (state.listening) { recognition.stop(); return; }
  speechSynthesis.cancel();
  state.listening = true;
  $('#micBtn').classList.add('is-live');
  recognition.start();
});

$('#textInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const t = e.target.value.trim();
    e.target.value = '';
    speechSynthesis.cancel();
    sendToAI(t);
  }
});

function startCall() {
  show('call');
  captionsEl.innerHTML = '';
  state.chat = [];
  state.userTurns = 0;
  $('#foursnapCta').hidden = true;
  $('#callVideo').src = state.partner.img;
  $('#callName').textContent = state.partner.name;
  $('#callStatus').textContent = '통화 중';
  state.callSec = 0;
  clearInterval(state.callTimerId);
  state.callTimerId = setInterval(() => {
    state.callSec++;
    const m = String(Math.floor(state.callSec / 60)).padStart(2, '0');
    const s = String(state.callSec % 60).padStart(2, '0');
    $('#callTimer').textContent = `${m}:${s}`;
  }, 1000);

  // 첫 인사는 AI가 먼저
  const hello = `여보세요? 어, 드디어 받았다! 나 ${state.partner.name}. 오늘 하루 어땠어?`;
  state.chat.push({ role: 'assistant', content: hello });
  addCaption('ai', hello);
  speak(hello);
}

function endCall() {
  clearInterval(state.callTimerId);
  speechSynthesis.cancel();
  if (recognition && state.listening) recognition.stop();
  show('landing');
}

// ---------- 네컷: 스텝 ----------
const STEP_ORDER = ['selfie', 'concept', 'result'];
function goStep(step) {
  $$('#app [data-step]').forEach((s) => s.classList.toggle('is-active', s.dataset.step === step));
  const idx = STEP_ORDER.indexOf(step);
  const bar = $('#steps');
  bar.innerHTML = '';
  STEP_ORDER.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'steps__dot' + (i < idx ? ' is-done' : i === idx ? ' is-active' : '');
    bar.appendChild(d);
  });
  state._step = step;
}

// 셀피 업로드
$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadImage(url).then((img) => {
    state.selfie = img;
    const dz = $('#dropzone');
    dz.classList.add('has-image');
    $('#dropzoneInner').innerHTML = '';
    const view = new Image();
    view.src = url;
    $('#dropzoneInner').appendChild(view);
    $('#selfieNext').disabled = false;
  }).catch(() => toast('이미지를 불러오지 못했어요.'));
});
$('#selfieNext').addEventListener('click', () => goStep('concept'));

// 컨셉
function renderConcepts() {
  const wrap = $('#concepts');
  wrap.innerHTML = '';
  CONCEPTS.forEach((c, i) => {
    const el = document.createElement('button');
    el.className = 'concept' + (i === 0 ? ' is-selected' : '');
    el.style.background = `linear-gradient(135deg, ${c.bg[0]}, ${c.bg[1]})`;
    el.innerHTML = `
      <span class="concept__emoji">${c.emoji}</span>
      <span class="concept__name">${c.name}</span>
      <span class="concept__cap">${c.cap}</span>`;
    el.addEventListener('click', () => {
      state.concept = c;
      $$('.concept').forEach((x) => x.classList.remove('is-selected'));
      el.classList.add('is-selected');
    });
    wrap.appendChild(el);
  });
}

// ---------- 네컷: 캔버스 렌더 ----------
function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) * 0.28; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function renderFourSnap() {
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const c = state.concept;
  const W = canvas.width, H = canvas.height;
  const PAD = 34, GAP = 26, FOOT = 150;
  const cutH = (H - PAD * 2 - GAP * 3 - FOOT) / 4;
  const cutW = W - PAD * 2;

  const partnerImg = await loadImage(state.partner.img);

  // 프레임 배경
  ctx.fillStyle = c.frame;
  ctx.fillRect(0, 0, W, H);

  const FILTERS = ['none', 'saturate(1.25) contrast(1.05)', 'grayscale(0.85) contrast(1.1)', 'sepia(0.35) saturate(1.1)'];

  for (let i = 0; i < 4; i++) {
    const y = PAD + i * (cutH + GAP);
    // 컷 배경 그라데이션
    const g = ctx.createLinearGradient(PAD, y, PAD + cutW, y + cutH);
    g.addColorStop(0, c.bg[0]);
    g.addColorStop(1, c.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(PAD, y, cutW, cutH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, y, cutW, cutH);
    ctx.clip();
    ctx.filter = FILTERS[i];

    const inset = 10;
    if (state.selfie) {
      // 좌: 유저, 우: AI 연인
      const half = (cutW - inset * 3) / 2;
      drawCover(ctx, state.selfie, PAD + inset, y + inset, half, cutH - inset * 2);
      drawCover(ctx, partnerImg, PAD + inset * 2 + half, y + inset, half, cutH - inset * 2);
    } else {
      drawCover(ctx, partnerImg, PAD + inset, y + inset, cutW - inset * 2, cutH - inset * 2);
    }
    ctx.restore();
    ctx.filter = 'none';

    // 컷별 스티커 텍스트
    ctx.font = '700 26px "Gothic A1", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.textAlign = 'right';
    const stickers = ['♡', `${state.partner.name} & me`, c.emoji, new Date().toLocaleDateString('ko-KR')];
    ctx.fillText(stickers[i], PAD + cutW - 16, y + cutH - 16);
  }

  // 푸터
  ctx.textAlign = 'center';
  ctx.fillStyle = c.ink;
  ctx.font = '800 40px "Gothic A1", sans-serif';
  ctx.fillText('러비더비', W / 2, H - FOOT / 2 - 8);
  ctx.font = '600 22px "Gothic A1", sans-serif';
  ctx.fillText(c.label, W / 2, H - FOOT / 2 + 28);
}

const LOADER_MSGS = ['필름 현상 중…', '조명 맞추는 중…', `${'포즈'} 잡는 중…`, '마지막 컷 인화 중…'];
async function generate() {
  goStep('result');
  const loader = $('#loader');
  const canvas = $('#canvas');
  loader.hidden = false;
  canvas.hidden = true;
  $('#resultActions').hidden = true;

  let i = 0;
  const msgId = setInterval(() => {
    $('#loaderText').textContent = LOADER_MSGS[++i % LOADER_MSGS.length];
  }, 700);

  try {
    await Promise.all([
      renderFourSnap(),
      new Promise((r) => setTimeout(r, 2200)), // 현상되는 맛
    ]);
    loader.hidden = true;
    canvas.hidden = false;
    $('#resultActions').hidden = false;
  } catch (e) {
    console.error(e);
    toast('이미지 생성에 실패했어요. 다시 시도해 주세요.');
    goStep('concept');
  } finally {
    clearInterval(msgId);
  }
}

function downloadResult() {
  try {
    const a = document.createElement('a');
    a.download = `lovedovey-4cut-${Date.now()}.png`;
    a.href = $('#canvas').toDataURL('image/png');
    a.click();
    toast('저장했어요! 릴스에 올려보세요 💕');
  } catch (e) {
    toast('저장에 실패했어요. 스크린샷을 이용해 주세요.');
  }
}

async function shareResult() {
  const canvas = $('#canvas');
  try {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'lovedovey-4cut.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '러비더비 인생네컷', text: '내 AI 연인이랑 찍은 인생네컷 💕' });
    } else {
      downloadResult();
    }
  } catch (e) { /* 사용자가 공유 취소 */ }
}

// ---------- 전역 액션 라우팅 ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  if (act === 'go-call') { state.from = 'call'; show('partner'); }
  if (act === 'go-foursnap') { state.from = 'foursnap'; show('partner'); }
  if (act === 'back-landing') show('landing');
  if (act === 'end-call') endCall();
  if (act === 'cta-foursnap') {
    clearInterval(state.callTimerId);
    speechSynthesis.cancel();
    show('foursnap');
    goStep('selfie');
  }
  if (act === 'back-foursnap') {
    const i = STEP_ORDER.indexOf(state._step);
    if (i <= 0) show('landing');
    else goStep(STEP_ORDER[i - 1]);
  }
  if (act === 'skip-selfie') { state.selfie = null; goStep('concept'); }
  if (act === 'generate') generate();
  if (act === 'download') downloadResult();
  if (act === 'share') shareResult();
  if (act === 'restart') { show('landing'); goStep('selfie'); }
});

// ---------- 초기화 ----------
renderPartners();
renderConcepts();
if ('speechSynthesis' in window) speechSynthesis.getVoices(); // 보이스 목록 예열
