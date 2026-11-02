// 영끌런 메인 로직
(() => {
  const T = 32;               // 타일 크기
  const VIEW_W = 384;         // 화면 가로(12칸)
  const VIEW_H = 384;         // 화면 세로(12칸)
  const GRAVITY = 1900;
  const RUN = 190;
  const ACCEL = 1400;
  const JUMP = 560;      // 첫 점프(중간 높이)
  const JUMP2 = 620;     // 공중에서 한 번 더: 더블 점프(높게)
  const MAX_FALL = 900;
  const SAVE_KEY = 'yeongkkeul-run-v1';

  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  let save = loadSave();
  let L = null;     // 현재 레벨 상태
  let running = false;
  let lastTs = 0;
  const input = { left: false, right: false, jump: false, jumpHeld: false };

  // ---------- 저장 ----------
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { unlocked: 0, best: {} }; }
    catch (e) { return { unlocked: 0, best: {} }; }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  function won(man) {
    const a = Math.round(man);
    const eok = Math.floor(a / 10000);
    const rest = a % 10000;
    if (!eok) return rest.toLocaleString() + '만원';
    return eok + '억' + (rest ? ' ' + rest.toLocaleString() + '만' : '') + '원';
  }

  // ---------- 레벨 준비 ----------
  function startWorld(wi) {
    const w = WORLDS[wi];
    const rows = buildLevel(wi).map((r) => r.split(''));
    const cols = rows[0].length;
    const enemies = [];
    let coins = 0;
    let gate = null;
    let spawn = { x: 2 * T, y: 8 * T };
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = rows[r][c];
        if (ch === '$') coins++;
        if (ch === 'w' || ch === 'f') {
          enemies.push({ type: ch, x: c * T + 4, y: r * T + 6, w: 24, h: 26, vx: -(ch === 'f' ? 95 : 45) * w.speed, vy: 0, alive: true });
          rows[r][c] = '.';
        }
        if (ch === 'c') {
          enemies.push({ type: 'c', x: c * T, y: r * T, w: 30, h: 22, bx: c * T, by: r * T, t: Math.random() * 6, alive: true });
          rows[r][c] = '.';
        }
        if (ch === 'G') { gate = { c, r }; rows[r][c] = '.'; }
      }
    }
    const need = Math.ceil(coins * NEED_RATIO) * w.coin;
    L = {
      wi, w, rows, cols, enemies, gate, need,
      totalCoins: coins,
      money: 0,
      hearts: 3,
      time: 0,
      spawn,
      checkpoint: null,
      p: { x: spawn.x, y: spawn.y, w: 20, h: 28, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1, inv: 0, jumps: 0 },
      camX: 0,
      msg: '', msgT: 0,
      popups: [],
      puffs: [],
      done: false,
    };
    showOverlay(`<div class="big">${w.name}</div><p>${w.sub}</p>
      <p>계약금 <b>${won(need)}</b>을 모아 이사 심사 대문을 통과하세요.</p>
      <button class="btn" id="go">시작</button>`, () => { hideOverlay(); begin(); });
    updateHud();
    draw();
  }

  function begin() {
    running = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------- 타일 ----------
  function tileAt(c, r) {
    if (r < 0) return '.';
    if (r >= L.rows.length || c < 0 || c >= L.cols) return r >= L.rows.length ? '.' : '#';
    return L.rows[r][c];
  }
  function gateLocked() { return L.money < L.need; }
  function solid(c, r) {
    const t = tileAt(c, r);
    if (t === '#' || t === '=') return true;
    // 잠긴 대문은 벽
    if (L.gate && gateLocked() && c === L.gate.c && r <= L.gate.r && r >= L.gate.r - 3) return true;
    return false;
  }

  function moveX(o, dx) {
    o.x += dx;
    const top = Math.floor(o.y / T);
    const bot = Math.floor((o.y + o.h - 1) / T);
    if (dx > 0) {
      const c = Math.floor((o.x + o.w) / T);
      for (let r = top; r <= bot; r++) if (solid(c, r)) { o.x = c * T - o.w - 0.01; return true; }
    } else if (dx < 0) {
      const c = Math.floor(o.x / T);
      for (let r = top; r <= bot; r++) if (solid(c, r)) { o.x = (c + 1) * T + 0.01; return true; }
    }
    return false;
  }
  function moveY(o, dy) {
    o.y += dy;
    const left = Math.floor(o.x / T);
    const right = Math.floor((o.x + o.w - 1) / T);
    o.onGround = false;
    if (dy > 0) {
      const r = Math.floor((o.y + o.h) / T);
      for (let c = left; c <= right; c++) if (solid(c, r)) { o.y = r * T - o.h; o.vy = 0; o.onGround = true; return; }
    } else if (dy < 0) {
      const r = Math.floor(o.y / T);
      for (let c = left; c <= right; c++) if (solid(c, r)) { o.y = (r + 1) * T; o.vy = 0; return; }
    }
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- 진행 ----------
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    draw();
    if (running) requestAnimationFrame(loop);
  }

  function update(dt) {
    const p = L.p;
    L.time += dt;

    // 좌우
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) p.facing = dir;
    const target = dir * RUN;
    if (p.vx < target) p.vx = Math.min(target, p.vx + ACCEL * dt);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - ACCEL * dt);

    // 점프 (땅에서 떨어진 직후·누르기 직전 여유 시간 포함)
    // 점프: 한 번은 중간 높이, 공중에서 한 번 더 누르면 높게(더블 점프)
    if (p.onGround) p.jumps = 0;
    p.coyote = p.onGround ? 0.09 : Math.max(0, p.coyote - dt);
    if (input.jump) { p.buffer = 0.12; input.jump = false; }
    else p.buffer = Math.max(0, p.buffer - dt);
    if (p.buffer > 0) {
      if (p.coyote > 0 && p.jumps === 0) {
        p.vy = -JUMP; p.jumps = 1;
        p.buffer = 0; p.coyote = 0; p.onGround = false;
      } else if (!p.onGround && p.jumps < 2) {
        p.vy = -JUMP2; p.jumps = 2; p.buffer = 0;
        L.puffs.push({ x: p.x + p.w / 2, y: p.y + p.h, t: 0.35 });
      }
    }

    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    moveX(p, p.vx * dt);
    moveY(p, p.vy * dt);
    if (p.x < 0) p.x = 0;
    p.inv = Math.max(0, p.inv - dt);

    // 계약금·가시·중간 저장
    const c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + p.w - 1) / T);
    const r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + p.h - 1) / T);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = tileAt(c, r);
        if (t === '$') {
          L.rows[r][c] = '.';
          L.money += L.w.coin;
          popup(c * T + 16, r * T, '+' + won(L.w.coin));
        } else if (t === '^') {
          if (p.y + p.h > r * T + 14) hurt();
        } else if (t === 'C') {
          L.rows[r][c] = 'K';
          L.checkpoint = { x: c * T, y: r * T - 4 };
          flash('📍 중개사무소에 저장했어요');
        }
      }
    }

    // 적
    L.enemies.forEach((e) => {
      if (!e.alive) return;
      if (e.type === 'c') {
        e.t += dt;
        e.x = e.bx + Math.sin(e.t * 0.9) * 70;
        e.y = e.by + Math.sin(e.t * 2.1) * 24;
      } else {
        if (Math.abs(e.x - p.x) > VIEW_W * 1.2) return; // 화면 밖은 대기
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        const hit = moveX(e, e.vx * dt);
        moveY(e, e.vy * dt);
        // 벽이나 낭떠러지에서 돌아서기
        const aheadC = Math.floor((e.vx > 0 ? e.x + e.w + 2 : e.x - 2) / T);
        const belowR = Math.floor((e.y + e.h + 2) / T);
        if (hit || (e.onGround && !solid(aheadC, belowR))) e.vx = -e.vx;
        if (e.y > VIEW_H + 64) e.alive = false;
      }
      if (overlap(p, e)) {
        const stomp = e.type !== 'c' && p.vy > 0 && p.y + p.h - e.y < 16;
        if (stomp) {
          e.alive = false;
          p.vy = -420;
          const bonus = Math.round(L.w.coin * 0.5);
          L.money += bonus;
          popup(e.x + 12, e.y, e.type === 'f' ? '사기꾼 퇴치!' : '고지서 처리!');
        } else {
          hurt(e.x + e.w / 2 < p.x + p.w / 2 ? 1 : -1);
        }
      }
    });

    // 낭떠러지
    if (p.y > VIEW_H + 40) {
      loseHeart('떨어졌어요!');
      if (running) respawn();
    }

    // 대문
    if (L.gate) {
      const gx = L.gate.c * T;
      if (gateLocked() && p.x + p.w > gx - 6 && p.x < gx + T) {
        if (L.msgT <= 0) flash(`🚪 계약금이 부족해요 (${won(L.money)} / ${won(L.need)})`);
      }
      if (!gateLocked() && p.x > gx + 4) return clearWorld();
    }

    // 카메라
    const maxCam = L.cols * T - VIEW_W;
    const want = p.x - VIEW_W * 0.38;
    L.camX = Math.max(0, Math.min(maxCam, want));

    L.popups.forEach((q) => { q.t -= dt; q.y -= 30 * dt; });
    L.popups = L.popups.filter((q) => q.t > 0);
    L.puffs.forEach((q) => { q.t -= dt; });
    L.puffs = L.puffs.filter((q) => q.t > 0);
    L.msgT = Math.max(0, L.msgT - dt);
    updateHud();
  }

  function popup(x, y, text) { L.popups.push({ x, y, text, t: 0.9 }); }
  function flash(text) { L.msg = text; L.msgT = 2; }

  function hurt(knock) {
    const p = L.p;
    if (p.inv > 0) return;
    p.vx = (knock || -p.facing) * 220;
    p.vy = -300;
    loseHeart('아야!');
  }
  function loseHeart(text) {
    L.hearts--;
    L.p.inv = 1.6;
    flash(L.hearts > 0 ? `💔 ${text} 건강 ${L.hearts}칸 남음` : '');
    if (L.hearts <= 0) gameOver();
  }
  function respawn() {
    const s = L.checkpoint || L.spawn;
    L.p.x = s.x; L.p.y = s.y; L.p.vx = 0; L.p.vy = 0;
  }

  function gameOver() {
    running = false;
    updateHud();
    showOverlay(`<div class="big">😵 번아웃</div><p>${L.w.name}에서 쓰러졌어요.</p>
      <button class="btn" id="go">다시 도전</button><button class="btn ghost" id="menu">처음 화면</button>`,
      () => startWorld(L.wi), () => showTitle());
  }

  function clearWorld() {
    running = false;
    const wi = L.wi;
    const t = L.time;
    const prev = save.best[wi];
    const isBest = !prev || t < prev;
    if (isBest) save.best[wi] = t;
    save.unlocked = Math.max(save.unlocked, Math.min(wi + 1, WORLDS.length - 1));
    if (wi === WORLDS.length - 1) save.cleared = true;
    writeSave();
    const last = wi === WORLDS.length - 1;
    const total = WORLDS.every((_, i) => save.best[i]) ? WORLDS.reduce((s, _, i) => s + save.best[i], 0) : null;
    showOverlay(last
      ? `<div class="big">🎉 강남 입성!</div><p>계약금 ${won(L.money)}으로 강남 84㎡에 들어갔어요.</p>
         <p>이번 기록 ${t.toFixed(1)}초${isBest ? ' 🏆' : ''}</p>${total ? `<p>4개 월드 최고 기록 합계 <b>${total.toFixed(1)}초</b></p>` : ''}
         <button class="btn" id="go">처음 화면</button>`
      : `<div class="big">🚚 이사 성공!</div><p>계약금 ${won(L.money)} 모아서 통과했어요.</p>
         <p>기록 ${t.toFixed(1)}초${isBest ? ' · 🏆 최고 기록' : ''}</p>
         <button class="btn" id="go">${WORLDS[wi + 1].name}로 이사하기</button><button class="btn ghost" id="menu">처음 화면</button>`,
      () => (last ? showTitle() : startWorld(wi + 1)), () => showTitle());
  }

  // ---------- 그리기 ----------
  const D = 7; // 입체 깊이(윗면·옆면 두께)

  function shade(hex, amt) {
    // amt: -1(검게) ~ +1(밝게)
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
    return `rgb(${r},${g},${b})`;
  }

  const isBlock = (t) => t === '#' || t === '=';

  function quad(a, b, c, d, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    ctx.closePath();
    ctx.fill();
  }

  // 땅 한 칸: 윗면(잔디)·오른쪽 옆면·앞면을 따로 칠해 상자처럼 보이게
  function drawGround(c, r, x, y) {
    const w = L.w;
    const openTop = !isBlock(tileAt(c, r - 1));
    const openRight = !isBlock(tileAt(c + 1, r));
    if (openRight) quad([x + T, y], [x + T + D, y - D], [x + T + D, y + T - D], [x + T, y + T], '#5d4037');
    if (openTop) quad([x, y], [x + D, y - D], [x + T + D, y - D], [x + T, y], shade(w.color, 0.35));
    const g = ctx.createLinearGradient(0, 160, 0, VIEW_H); // 아래로 갈수록 어둡게(땅속 깊이)
    g.addColorStop(0, '#bcaaa4');
    g.addColorStop(1, '#5d4037');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, T, T);
    // 돌 무늬
    ctx.fillStyle = 'rgba(62,39,35,.18)';
    ctx.fillRect(x + ((c * 7) % 18) + 4, y + ((r * 5) % 14) + 10, 7, 4);
    if (openTop) {
      const gg = ctx.createLinearGradient(0, y, 0, y + 10);
      gg.addColorStop(0, shade(w.color, 0.1));
      gg.addColorStop(1, shade(w.color, -0.25));
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, T, 10);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(x, y + 10, T, 3);
    }
    // 테두리 빛과 그늘
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x, y, 2, T);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(x + T - 2, y, 2, T);
  }

  function drawPlatform(c, r, x, y) {
    const openRight = tileAt(c + 1, r) !== '=';
    const openLeft = tileAt(c - 1, r) !== '=';
    if (openRight) quad([x + T, y], [x + T + D, y - D], [x + T + D, y + 14 - D], [x + T, y + 14], '#bf360c');
    quad([x, y], [x + D, y - D], [x + T + D, y - D], [x + T, y], '#ffe0b2');
    const g = ctx.createLinearGradient(0, y, 0, y + 14);
    g.addColorStop(0, '#ffb74d');
    g.addColorStop(1, '#ef6c00');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, T, 14);
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.fillRect(x + T - 1, y, 1, 14);
    if (openLeft) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, 2, 14); }
    // 발판 아래 그림자
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(x + 4, y + 14, T - 4, 6);
  }

  function drawCoin(x, y, t) {
    const bob = Math.sin(t * 4 + x * 0.05) * 3;
    const squash = Math.abs(Math.cos(t * 3 + x * 0.03)) * 0.6 + 0.4; // 빙글 도는 느낌
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(x + 16, y + 30, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    const cx = x + 16, cy = y + 15 + bob;
    const g = ctx.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 11);
    g.addColorStop(0, '#fff8e1');
    g.addColorStop(0.35, '#ffd54f');
    g.addColorStop(1, '#f57f17');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, 10 * squash, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e65100';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (squash > 0.6) {
      ctx.fillStyle = '#bf360c';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('₩', cx, cy + 1);
    }
  }

  function drawSpike(x, y) {
    for (let i = 0; i < 2; i++) {
      const bx = x + i * 16;
      quad([bx, y + T], [bx + 8, y + 10], [bx + 8, y + 10], [bx + 8, y + T], '#cfd8dc');
      quad([bx + 8, y + T], [bx + 8, y + 10], [bx + 8, y + 10], [bx + 16, y + T], '#607d8b');
    }
  }

  // 바닥까지의 거리로 그림자 크기·진하기를 정함
  function groundShadow(o, cam) {
    const c = Math.floor((o.x + o.w / 2) / T);
    let r = Math.floor((o.y + o.h) / T);
    for (let k = 0; k < 8 && r < L.rows.length; k++, r++) {
      if (isBlock(tileAt(c, r))) {
        const gy = r * T;
        const dist = Math.max(0, gy - (o.y + o.h));
        const s = Math.max(0.3, 1 - dist / 160);
        ctx.fillStyle = `rgba(0,0,0,${0.28 * s})`;
        ctx.beginPath();
        ctx.ellipse(o.x - cam + o.w / 2, gy + 1, 13 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
    }
  }

  function emoji(ch, x, y, size, flip) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = flip ? -2 : 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#000'; // 이모지는 fillStyle의 투명도를 따라가므로 불투명으로
    ctx.globalAlpha = 1;
    ctx.font = size + 'px sans-serif';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }

  function label(text, x, y, color) {
    ctx.font = 'bold 9px sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function draw() {
    if (!L) return;
    const w = L.w;
    const cam = Math.round(L.camX);
    const now = performance.now() / 1000;
    drawBackground(cam);

    const c0 = Math.floor(cam / T) - 1, c1 = c0 + Math.ceil(VIEW_W / T) + 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 블록 (위에서 아래로, 왼쪽부터 그려야 윗면이 겹치지 않음)
    for (let r = 0; r < L.rows.length; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = tileAt(c, r);
        const x = c * T - cam, y = r * T;
        if (t === '#' && c >= 0 && c < L.cols) drawGround(c, r, x, y);
        else if (t === '=') drawPlatform(c, r, x, y);
      }
    }
    for (let r = 0; r < L.rows.length; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = tileAt(c, r);
        const x = c * T - cam, y = r * T;
        if (t === '$') drawCoin(x, y, now);
        else if (t === '^') drawSpike(x, y);
        else if (t === 'C' || t === 'K') {
          emoji(t === 'K' ? '🏢' : '🏚️', x + 16, y + 14, 24);
          label('중개사무소', x + 16, y - 6, '#37474f');
        }
      }
    }

    // 이사 심사 대문: 기둥 두 개와 지붕이 있는 입체 문
    if (L.gate) {
      const x = L.gate.c * T - cam;
      const yTop = (L.gate.r - 3) * T;
      const locked = gateLocked();
      const base = locked ? '#78909c' : '#43a047';
      quad([x + T, yTop], [x + T + D, yTop - D], [x + T + D, yTop + T * 4 - D], [x + T, yTop + T * 4], shade(base, -0.35));
      quad([x, yTop], [x + D, yTop - D], [x + T + D, yTop - D], [x + T, yTop], shade(base, 0.3));
      const g = ctx.createLinearGradient(x, 0, x + T, 0);
      g.addColorStop(0, shade(base, 0.15));
      g.addColorStop(1, shade(base, -0.15));
      ctx.fillStyle = g;
      ctx.fillRect(x, yTop, T, T * 4);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ['이', '사', '심', '사'].forEach((ch, i) => ctx.fillText(ch, x + 16, yTop + 18 + i * 22));
      // 지붕
      quad([x - 8, yTop - 2], [x + 16 + D / 2, yTop - 22], [x + 16 + D / 2, yTop - 22], [x + T + 8 + D, yTop - 2], shade(base, -0.2));
      emoji(locked ? '🔒' : '🔓', x + 16, yTop - 36, 20);
      emoji('🏠', x + 3 * T, L.gate.r * T + 12, 26);
    }

    // 적
    L.enemies.forEach((e) => {
      if (!e.alive) return;
      const x = e.x - cam;
      if (x < -40 || x > VIEW_W + 40) return;
      if (e.type === 'c') {
        groundShadow(e, cam);
        emoji('🌧️', x + 15, e.y + 10, 28);
        label('금리↑', x + 15, e.y - 10, '#c62828');
      } else {
        groundShadow(e, cam);
        if (e.type === 'f') { emoji('🕴️', x + 12, e.y + 14, 26); label('사기꾼', x + 12, e.y - 6, '#4a148c'); }
        else { emoji('📄', x + 12, e.y + 14, 24); label('고지서', x + 12, e.y - 6, '#b71c1c'); }
      }
    });

    // 플레이어 (이모지는 왼쪽을 보고 있어 오른쪽일 때 뒤집음)
    // 더블 점프 때 발밑 연기
    L.puffs.forEach((q) => {
      const k = 1 - q.t / 0.35;
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.beginPath(); ctx.ellipse(q.x - cam, q.y + 4, 8 + k * 16, 4 + k * 4, 0, 0, Math.PI * 2); ctx.fill();
    });
    const p = L.p;
    groundShadow(p, cam);
    if (!(p.inv > 0 && Math.floor(p.inv * 12) % 2)) emoji('🏃', p.x - cam + p.w / 2, p.y + p.h / 2, 28, p.facing > 0);

    // 화면 가장자리를 살짝 어둡게
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 팝업 글자
    ctx.font = 'bold 12px sans-serif';
    L.popups.forEach((q) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, q.t * 2)})`;
      ctx.strokeText(q.text, q.x - cam, q.y);
      ctx.fillStyle = `rgba(230,81,0,${Math.min(1, q.t * 2)})`;
      ctx.fillText(q.text, q.x - cam, q.y);
    });

    // 안내
    if (L.msgT > 0 && L.msg) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(10, 10, VIEW_W - 20, 28);
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.fillText(L.msg, VIEW_W / 2, 24);
    }
  }

  // 배경: 하늘·해 → 먼 산 → 먼 건물 → 가까운 건물(옆면·창문) 순으로, 멀수록 천천히 움직임
  function drawBackground(cam) {
    const w = L.w;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, w.sky[0]);
    g.addColorStop(1, w.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 해
    const sx = 300 - cam * 0.02, sy = 70;
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    sg.addColorStop(0, 'rgba(255,253,231,1)');
    sg.addColorStop(0.25, 'rgba(255,241,118,.9)');
    sg.addColorStop(1, 'rgba(255,241,118,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.fill();

    // 구름 (아래쪽에 그늘)
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 170 - cam * 0.08) % 700 + 700) % 700 - 100;
      const cy = 50 + i * 14;
      ctx.fillStyle = 'rgba(180,200,220,.45)';
      ctx.beginPath(); ctx.arc(cx, cy + 5, 18, 0, Math.PI * 2); ctx.arc(cx + 22, cy + 3, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.arc(cx + 22, cy - 4, 22, 0, Math.PI * 2); ctx.fill();
    }

    // 먼 산
    ctx.fillStyle = shade(w.color, 0.55);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 8) {
      const wx = x + cam * 0.05;
      ctx.lineTo(x, 230 + Math.sin(wx * 0.012) * 26 + Math.sin(wx * 0.031) * 12);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.fill();
    ctx.globalAlpha = 1;

    cityLayer(cam * 0.15, 31 + L.wi, 0.6, 'rgba(120,135,170,.35)', null);
    cityLayer(cam * 0.35, 53 + L.wi, 1.0, null, true);
  }

  function cityLayer(off, seed, scale, flat, detailed) {
    const level = L.w.city;
    const rnd = seeded(seed);
    const builds = [];
    for (let i = 0; i < 24; i++) builds.push({ w: (28 + rnd() * 30) * scale, h: (40 + rnd() * 38 * level) * scale, hue: rnd() });
    const total = builds.reduce((s, b) => s + b.w + 10 * scale, 0);
    let x = -(off % total);
    const ground = VIEW_H - 64;
    for (let k = 0; k < 2; k++) {
      builds.forEach((b) => {
        if (x < VIEW_W + 20 && x + b.w > -20) {
          const top = ground - b.h;
          if (flat) {
            ctx.fillStyle = flat;
            ctx.fillRect(x, top, b.w, b.h);
          } else {
            const d = 6;
            const front = b.hue > 0.5 ? '#9fb3c8' : '#b8c6d6';
            quad([x + b.w, top], [x + b.w + d, top - d], [x + b.w + d, ground - d], [x + b.w, ground], 'rgba(90,105,130,.55)');
            quad([x, top], [x + d, top - d], [x + b.w + d, top - d], [x + b.w, top], 'rgba(230,236,244,.75)');
            ctx.fillStyle = front;
            ctx.globalAlpha = 0.75;
            ctx.fillRect(x, top, b.w, b.h);
            ctx.globalAlpha = 1;
            if (detailed) {
              ctx.fillStyle = 'rgba(255,255,255,.45)';
              for (let wy = top + 8; wy < ground - 10; wy += 12) {
                for (let wx = x + 5; wx < x + b.w - 6; wx += 9) ctx.fillRect(wx, wy, 4, 6);
              }
            }
          }
        }
        x += b.w + 10 * scale;
      });
    }
  }

  // ---------- 화면 ----------
  function updateHud() {
    if (!L) return;
    $('#hud-world').textContent = L.w.name;
    $('#hud-world').style.background = L.w.color;
    $('#hud-money').textContent = `${won(L.money)} / ${won(L.need)}`;
    $('#hud-money').classList.toggle('ok', L.money >= L.need);
    $('#hud-hearts').textContent = '❤️'.repeat(Math.max(0, L.hearts)) + '🤍'.repeat(Math.max(0, 3 - L.hearts));
    $('#hud-time').textContent = L.time.toFixed(1) + '초';
  }

  function showOverlay(html, onGo, onMenu) {
    const o = $('#overlay');
    o.innerHTML = `<div class="ov-box">${html}</div>`;
    o.classList.remove('hidden');
    const go = $('#go');
    if (go) go.onclick = () => { hideOverlay(); onGo && onGo(); };
    const menu = $('#menu');
    if (menu) menu.onclick = () => { hideOverlay(); onMenu && onMenu(); };
  }
  function hideOverlay() { $('#overlay').classList.add('hidden'); }

  function showTitle() {
    running = false;
    const list = WORLDS.map((w, i) => {
      const open = i <= save.unlocked;
      const b = save.best[i];
      return `<button class="world ${open ? '' : 'locked'}" data-w="${i}" ${open ? '' : 'disabled'}>
        <span class="wn" style="background:${w.color}">${i + 1}</span>
        <span class="wt"><b>${w.name}</b><small>${open ? (b ? `최고 ${b.toFixed(1)}초` : w.sub) : '🔒 앞 월드를 깨면 열려요'}</small></span>
      </button>`;
    }).join('');
    showOverlay(`<div class="logo">🏃🏠</div><div class="big">영끌런</div>
      <p>지방에서 강남까지, 계약금을 모아 달려라!</p>
      <div class="worlds">${list}</div>
      <p class="small">◀ ▶로 움직이고, 점프는 한 번 누르면 중간·공중에서 한 번 더 누르면 높이! 고지서·사기꾼은 밟고, 금리 구름은 피하세요.</p>`);
    document.querySelectorAll('.world').forEach((el) => {
      el.onclick = () => { hideOverlay(); startWorld(Number(el.dataset.w)); };
    });
  }

  // ---------- 입력 ----------
  function bindHold(id, key) {
    const el = $(id);
    const on = (e) => {
      e.preventDefault();
      if (key === 'jump') { input.jump = true; input.jumpHeld = true; }
      else input[key] = true;
      el.classList.add('down');
    };
    const off = (e) => {
      e.preventDefault();
      if (key === 'jump') input.jumpHeld = false;
      else input[key] = false;
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }

  function init() {
    // 선명하게 그리기
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    bindHold('#btn-left', 'left');
    bindHold('#btn-right', 'right');
    bindHold('#btn-jump', 'jump');
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { input.jump = true; input.jumpHeld = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') input.jumpHeld = false;
    });
    $('#btn-menu').onclick = () => showTitle();
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    showTitle();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.__run = { get L() { return L; }, input, startWorld }; // 테스트용
})();
