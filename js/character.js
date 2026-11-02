// 영끌런 주인공: 아기 사회초년생 (캔버스로 직접 그려 팔다리가 움직임)
// baby(ctx, x, 발밑 y, {run, t, air, flip, spin}, 크기)
function ball(ctx, x, y, r, base, light, dark, sx = 1) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.05);
  g.addColorStop(0, light); g.addColorStop(0.5, base); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * sx, r, 0, 0, Math.PI * 2); ctx.fill();
}
function nub(ctx, x1, y1, ang, len, w, base, light, dark) {
  // 통통한 짧은 팔다리: 끝이 둥근 캡슐
  const x2 = x1 + Math.sin(ang) * len, y2 = y1 + Math.cos(ang) * len;
  const g = ctx.createLinearGradient(x1 - w, y1 - w, x1 + w, y1 + w);
  g.addColorStop(0, light); g.addColorStop(0.5, base); g.addColorStop(1, dark);
  ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  return [x2, y2];
}
function pose(p) {
  const s = Math.sin(p.t * Math.PI * 2);
  if (p.air === 1) return { legA: -0.8, legB: 0.7, armA: -2.4, armB: 0.9, bob: 0, spin: 0, squash: 1 };
  if (p.air === 2) return { legA: -1.6, legB: -1.4, armA: -2.8, armB: -2.6, bob: 0, spin: 0, squash: 1 };
  if (p.run) return { legA: s * 0.9, legB: -s * 0.9, armA: -s * 1.1, armB: s * 1.1, bob: -Math.abs(Math.cos(p.t * Math.PI * 2)) * 4, spin: 0, squash: 1 };
  return { legA: 0.12, legB: -0.12, armA: 0.25, armB: -0.25, bob: 0, spin: 0, squash: 1 };
}

// 크기 k=1이 게임 속 크기(키 약 52px)
function baby(ctx, x, ground, p, k = 1) {
  const q = pose(p);
  ctx.save();
  ctx.translate(x, ground + q.bob * k);
  if (p.flip) ctx.scale(-1, 1);
  ctx.scale(k, k);
  if (p.spin) { ctx.translate(0, -24); ctx.rotate(p.spin); ctx.translate(0, 24); }
  const hip = -12;
  const skin = ['#ffd9bf', '#fff5ee', '#e8a988'];
  const suit = ['#5c6bc0', '#9fa8da', '#283593'];
  // 뒤쪽 다리·팔
  let f = nub(ctx, -4, hip, q.legB, 8, 9, '#3f51b5', '#7986cb', '#1a237e');
  ball(ctx, f[0] + 1.5, f[1] + 1, 4.8, '#6d4c41', '#a1887f', '#3e2723', 1.25);
  // 서류가방(뒤 손)
  f = nub(ctx, -8, hip - 12, q.armB, 7, 8, suit[0], suit[1], suit[2]);
  ball(ctx, f[0], f[1], 3.6, skin[0], skin[1], skin[2]);
  ctx.save(); ctx.translate(f[0], f[1] + 3);
  const bg = ctx.createLinearGradient(-7, 0, 7, 10); bg.addColorStop(0, '#a1887f'); bg.addColorStop(1, '#5d4037');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-7, 1, 14, 10, 2.5); ctx.fill();
  ctx.fillStyle = '#ffca28'; ctx.fillRect(-1.5, 4, 3, 2.5);
  ctx.restore();
  // 몸통: 작고 통통한 정장
  ball(ctx, 0, hip - 9, 12, suit[0], suit[1], suit[2], 0.95);
  // 셔츠 V + 넥타이
  ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.moveTo(-5, hip - 19); ctx.lineTo(5, hip - 19); ctx.lineTo(0, hip - 10); ctx.fill();
  ctx.fillStyle = '#ef5350'; ctx.beginPath(); ctx.moveTo(-2, hip - 18); ctx.lineTo(2, hip - 18); ctx.lineTo(2.6, hip - 9); ctx.lineTo(0, hip - 6.5); ctx.lineTo(-2.6, hip - 9); ctx.fill();
  // 앞 다리
  f = nub(ctx, 4, hip, q.legA, 8, 10, '#5c6bc0', '#9fa8da', '#283593');
  ball(ctx, f[0] + 1.5, f[1] + 1, 5.2, '#795548', '#bcaaa4', '#3e2723', 1.25);
  // 큰 머리
  const hy = hip - 38;
  ball(ctx, 1, hy, 21, skin[0], skin[1], skin[2]);
  // 귀
  ball(ctx, -19, hy + 2, 4.5, skin[0], skin[1], skin[2]);
  // 머리카락: 앞머리 + 정수리 삐침
  ctx.fillStyle = '#5d4037';
  ctx.beginPath(); ctx.arc(1, hy - 2, 21.5, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(1, hy, 21.3, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath(); ctx.moveTo(-16, hy - 10); ctx.quadraticCurveTo(-2, hy - 2, 8, hy - 9); ctx.quadraticCurveTo(14, hy - 4, 24, hy - 8); ctx.lineTo(24, hy - 24); ctx.lineTo(-18, hy - 24); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, hy - 22); ctx.quadraticCurveTo(4, hy - 32, 10, hy - 29); ctx.stroke();
  const hl = ctx.createRadialGradient(-6, hy - 18, 1, -2, hy - 14, 14);
  hl.addColorStop(0, 'rgba(255,255,255,.45)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(1, hy - 2, 21.5, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
  // 큰 눈 (반짝임 두 개)
  [[6, 4.2], [16, 3.8]].forEach(([ex, r]) => {
    if (p.air === 2) { // 신나서 눈 감은 웃음 ^^
      ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, hy + 4, r * 0.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      return;
    }
    const eg = ctx.createLinearGradient(0, hy - 2, 0, hy + 8);
    eg.addColorStop(0, '#1a1a2e'); eg.addColorStop(1, '#4e342e');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(ex, hy + 3, r, r * 1.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.2, hy + 0.5, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - 1.2, hy + 5.5, r * 0.2, 0, Math.PI * 2); ctx.fill();
  });
  // 볼터치
  ctx.fillStyle = 'rgba(255,110,130,.45)';
  ctx.beginPath(); ctx.ellipse(0, hy + 11, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(19, hy + 10, 3.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  // 입
  ctx.fillStyle = '#c2185b';
  ctx.beginPath();
  if (p.air) { ctx.ellipse(11, hy + 13, 2.6, 3, 0, 0, Math.PI * 2); }
  else { ctx.arc(11, hy + 11, 2.6, 0.1, Math.PI - 0.1); }
  ctx.fill();
  // 앞 팔
  f = nub(ctx, 7, hip - 13, q.armA, 7, 8.5, suit[0], suit[1], suit[2]);
  ball(ctx, f[0], f[1], 3.8, skin[0], skin[1], skin[2]);
  ctx.restore();
}

