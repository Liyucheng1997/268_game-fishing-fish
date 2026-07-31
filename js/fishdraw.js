// ===================== 程序化画鱼 =====================
// 以 (0,0) 为中心, 鱼头朝右, len 为鱼身长度(px)
// t: 时间(秒) 用于尾巴摆动; silhouette: 只画剪影(图鉴未解锁)
'use strict';

function drawFish(ctx, v, len, t = 0, silhouette = false) {
  const wag = Math.sin(t * 6) * len * 0.06; // 尾摆
  let ry;
  switch (v.shape) {
    case 'slim':   ry = len / 4.6; break;
    case 'long':   ry = len / 6.5; break;
    case 'flat':   ry = len / 2.3; break;
    case 'puffer': ry = len / 2.4; break;
    default:       ry = len / 3.2; // round
  }
  const rx = len / 2;
  const bodyC = silhouette ? '#0b1220' : v.body;
  const bellyC = silhouette ? '#0b1220' : (v.belly || v.body);
  const finC = silhouette ? '#0b1220' : (v.fin || v.body);

  ctx.save();

  // 发光鱼光晕
  if (v.glow && !silhouette) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.15;
    const g = ctx.createRadialGradient(0, 0, len * 0.1, 0, 0, len * 0.9);
    g.addColorStop(0, '#fff59d');
    g.addColorStop(1, 'rgba(255,245,157,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, len * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 尾鳍
  ctx.fillStyle = finC;
  ctx.beginPath();
  if (v.fancyTail) { // 金鱼大尾巴
    ctx.moveTo(-rx * 0.75, 0);
    ctx.quadraticCurveTo(-rx * 1.7, -ry * 2.2 + wag, -rx * 1.9, -ry * 0.5 + wag);
    ctx.quadraticCurveTo(-rx * 1.35, 0, -rx * 1.9, ry * 0.5 + wag);
    ctx.quadraticCurveTo(-rx * 1.7, ry * 2.2 + wag, -rx * 0.75, 0);
  } else {
    ctx.moveTo(-rx * 0.8, 0);
    ctx.lineTo(-rx * 1.35, -ry * 1.1 + wag);
    ctx.lineTo(-rx * 1.2, wag * 0.5);
    ctx.lineTo(-rx * 1.35, ry * 1.1 + wag);
  }
  ctx.closePath(); ctx.fill();

  // 身体
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  if (!silhouette) {
    const bg = ctx.createLinearGradient(0, -ry, 0, ry);
    bg.addColorStop(0, bodyC);
    bg.addColorStop(0.65, bodyC);
    bg.addColorStop(1, bellyC);
    ctx.fillStyle = bg;
  } else ctx.fillStyle = bodyC;
  ctx.fill();

  // 背鳍
  ctx.fillStyle = finC;
  ctx.beginPath();
  if (v.sharkFin) {
    ctx.moveTo(-rx * 0.1, -ry * 0.7);
    ctx.lineTo(rx * 0.15, -ry * 2.3);
    ctx.lineTo(rx * 0.4, -ry * 0.7);
  } else if (v.sail) { // 旗鱼帆
    ctx.moveTo(-rx * 0.6, -ry * 0.5);
    ctx.quadraticCurveTo(0, -ry * 3.1, rx * 0.5, -ry * 0.5);
  } else {
    ctx.moveTo(-rx * 0.35, -ry * 0.75);
    ctx.quadraticCurveTo(0, -ry * 1.8, rx * 0.35, -ry * 0.75);
  }
  ctx.closePath(); ctx.fill();

  // 腹鳍
  ctx.beginPath();
  ctx.moveTo(rx * 0.1, ry * 0.6);
  ctx.lineTo(-rx * 0.15, ry * 1.5);
  ctx.lineTo(-rx * 0.3, ry * 0.6);
  ctx.closePath(); ctx.fill();

  // 花纹
  if (!silhouette && v.pattern === 'stripes') {
    ctx.strokeStyle = v.patternColor;
    ctx.lineWidth = Math.max(1.5, len * 0.035);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * rx * 0.35, -ry * 2.2, ry * 2.6, Math.PI * 0.35, Math.PI * 0.65);
      ctx.stroke();
    }
  } else if (!silhouette && v.pattern === 'spots') {
    ctx.fillStyle = v.patternColor;
    const spots = [[-0.35, -0.2], [0.05, 0.25], [0.3, -0.25], [-0.1, -0.45], [0.45, 0.15]];
    spots.forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx * rx, sy * ry, len * 0.035, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (!silhouette && v.pattern === 'koi') {
    ctx.fillStyle = v.patternColor;
    ctx.beginPath(); ctx.ellipse(rx * 0.25, -ry * 0.25, rx * 0.28, ry * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-rx * 0.3, ry * 0.1, rx * 0.22, ry * 0.42, -0.2, 0, Math.PI * 2); ctx.fill();
  }

  // 河豚刺
  if (v.shape === 'puffer' && !silhouette) {
    ctx.strokeStyle = v.patternColor || '#8d6e63';
    ctx.lineWidth = Math.max(1, len * 0.02);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const px = Math.cos(a) * rx * 0.95, py = Math.sin(a) * ry * 0.95;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px * 1.18, py * 1.18);
      ctx.stroke();
    }
  }

  // 长嘴 (旗鱼/中华鲟)
  if (v.bill) {
    ctx.strokeStyle = silhouette ? bodyC : finC;
    ctx.lineWidth = Math.max(2, len * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx * 0.85, -ry * 0.15);
    ctx.lineTo(rx * 1.45, -ry * 0.05);
    ctx.stroke();
  }

  // 胡须
  if (v.whiskers && !silhouette) {
    ctx.strokeStyle = finC;
    ctx.lineWidth = Math.max(1, len * 0.018);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx * 0.8, ry * 0.15);
    ctx.quadraticCurveTo(rx * 1.1, ry * 0.55, rx * 0.95, ry * 0.9);
    ctx.moveTo(rx * 0.7, ry * 0.3);
    ctx.quadraticCurveTo(rx * 0.85, ry * 0.75, rx * 0.6, ry * 1.05);
    ctx.stroke();
  }

  // 身体高光（体积感）
  if (!silhouette) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.02, -ry * 0.45, rx * 0.55, ry * 0.26, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.55, rx * 0.8, ry * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 眼睛
  if (!silhouette) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(rx * 0.55, -ry * 0.25, Math.max(2, len * 0.055), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(rx * 0.58, -ry * 0.25, Math.max(1, len * 0.03), 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}
