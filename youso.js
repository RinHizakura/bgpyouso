// youso.js — 我的 BanG Dream! 成分：讀 Threads「下載你的資訊」匯出檔（threads_and_replies.json），算 9 團各佔幾成。
// 比對規則沿用 iamnotdd/bandori：bands.txt 一團一段，提到團名或任一成員就算該團 1 篇；成分 = 該團篇數 / 各團篇數合計。
// 全部在瀏覽器裡跑（index.html），貼文不離開電腦。自我檢查：node youso.js --demo
//
// 跟 API 版的差別（匯出檔沒有這些欄位）：
//   - 沒有 root_post：回覆沒辦法跟主貼文合併成一篇，每則各算 1 篇
//   - 沒有 permalink：角色排行沒有「代表作」連結
//   - 立繪、樂團 logo 直接引用官網圖（photos.txt），不下載

const BAND_COLOR = {"Poppin'Party": "#ff5522", "Afterglow": "#e53c4a", "Pastel*Palettes": "#ff9ecb", "Roselia": "#3b5dc9",
  "ハロー、ハッピーワールド！": "#ffcc00", "Morfonica": "#4ea6e1", "RAISE A SUILEN": "#b40080", "MyGO!!!!!": "#3f92e0", "Ave Mujica": "#5e3aa3"};
// 圓餅扇形專用底色：粉彩淺底襯飽和的 logo（ハロハピ logo 是黃的，只有它用深底），折線、色點仍用 BAND_COLOR
const PIE_COLOR = {"Poppin'Party": "#ffd0c2", "Afterglow": "#f5b8b8", "Pastel*Palettes": "#ffd6e6", "Roselia": "#d9ddf7",
  "ハロー、ハッピーワールド！": "#4a2d05", "Morfonica": "#cfe8f7", "RAISE A SUILEN": "#e9e0f7", "MyGO!!!!!": "#d8e6f5", "Ave Mujica": "#c9b8e8"};
const COLORS = ["#e0507a", "#4c8fdc", "#f0a43a", "#3fb28f", "#9a6ee0", "#e8733a", "#38b6c9", "#c9a23a", "#7a7a7a", "#d05fbf"];
const TITLE = "我的 BanG Dream! 成分";
// GitHub 經典貓標（octicon mark-github），首頁和報告頁尾共用
const GITHUB = `<a class="gh" href="https://github.com/RinHizakura/bgpyouso"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>RinHizakura/bgpyouso</a>`;

const split = s => s.split(/[=,]/).map(x => x.trim()).filter(Boolean);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;"}[c]));
const pct = (a, b, d = 1) => (b ? (a / b * 100).toFixed(d) : "0") + "%";

// ---------- 名單 ----------
function loadBands(txt) {
  // 回傳 {names: 別名→正式名（樂團名→樂團、排除詞→"!"）, bandOf: 正式名→樂團（樂團自己也算）, order: bands.txt 裡的樂團順序}
  const names = {}, bandOf = {}, order = [];
  let band = null;
  for (let line of txt.split("\n")) {
    line = line.trim();
    const m = line.match(/^#\s*={5,}\s*(.+?)\s*=+$/);
    if (m) {
      const parts = split(m[1]);
      band = parts[0]; order.push(band); bandOf[band] = band;
      for (const a of parts) names[a] = band;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const parts = split(line);
    if (parts[0] === "!") { for (const a of parts.slice(1)) names[a] = "!"; continue; }
    if (!band) continue;
    for (const a of parts) names[a.replace(/^@/, "")] = parts[0];
    bandOf[parts[0]] = band;
  }
  return {names, bandOf, order};
}

function loadPhotos(txt) {
  // photos.txt：正式名=圖片網址（角色立繪、樂團 logo 都放這）
  const m = {};
  for (let line of txt.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return m;
}

const img = (photos, name, cls = "") => photos[name] ? `<img class="${cls}" src="${esc(photos[name])}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer">` : "";

function compile(names) {
  // 長別名排前面：每個位置先試最長的，排除詞（電燈）比別名（燈）長所以先被吃掉
  // 拉丁字母開頭/結尾的別名要整個字：Ag 不吃 stage、Lisa 不吃 lisani（中日文沒空格，照舊找子字串）
  const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = a => (/^[a-z0-9]/i.test(a) ? "(?<![a-z0-9_])" : "") + re(a) + (/[a-z0-9]$/i.test(a) ? "(?![a-z0-9_])" : "");
  const pat = new RegExp(Object.keys(names).sort((a, b) => b.length - a.length).map(word).join("|"), "gi");
  const lookup = {}, spell = {};
  for (const a in names) { lookup[a.toLowerCase()] = names[a]; spell[a.toLowerCase()] = a; }
  return {pat, lookup, spell};
}

// 網址只留第一段路徑（threads.com/@帳號 也算提到），其餘拿掉——亂碼會誤中 Ag 之類的短別名
const textOf = p => (p.text || "").replace(/https?:\/\/[^/\s]+\/?([^/?#\s]*)\S*/g, "$1");

// ponytail: 單字或 1～2 個假名的別名最容易誤判（巴、彩、ひな），只靠這種對到的貼文列進「待確認」
const isWeak = a => a.length === 1 || /^[\u3040-\u30ff]{1,2}$/.test(a);

function analyze(posts, b, c) {
  // 回傳 {bands: {樂團: 篇}, chars: {角色: 篇}, hit: 有提到的篇數, months: {樂團: {YYYY-MM: 篇}},
  //       by: {正式名: [貼文索引]}, first: {正式名: 最早 timestamp}, pairs: [[角色, 角色, 篇]] 多→少, cross: 跨團同框篇數,
  //       weak: [{i, aliases, names}] 只靠弱別名對到的貼文}
  const bands = {}, chars = {}, months = {}, by = {}, first = {}, pairN = {}, weak = [];
  let hit = 0, cross = 0;
  posts.forEach((p, i) => {
    const found = {}, used = new Set();
    for (const m of textOf(p).match(c.pat) || []) {
      const k = c.lookup[m.toLowerCase()];
      if (k === "!") continue;
      found[k] = (found[k] || 0) + 1; used.add(c.spell[m.toLowerCase()]);
    }
    const names = Object.keys(found);
    if (!names.length) return;
    hit++;
    const hb = new Set(names.map(n => b.bandOf[n])), ym = (p.timestamp || "").slice(0, 7);
    if (hb.size > 1) cross++;
    for (const x of hb) { bands[x] = (bands[x] || 0) + 1; (months[x] = months[x] || {})[ym] = (months[x][ym] || 0) + 1; }
    const cs = names.filter(n => b.bandOf[n] !== n).sort();
    for (const n of cs) chars[n] = (chars[n] || 0) + 1;
    for (const x of [...hb, ...cs]) { (by[x] = by[x] || []).push(i); if (p.timestamp && (!first[x] || p.timestamp < first[x])) first[x] = p.timestamp; }
    for (let a = 0; a < cs.length; a++) for (let q = a + 1; q < cs.length; q++) pairN[cs[a] + "\0" + cs[q]] = (pairN[cs[a] + "\0" + cs[q]] || 0) + 1;
    if ([...used].every(isWeak)) weak.push({i, aliases: [...used], names});
  });
  const pairs = Object.entries(pairN).map(([k, n]) => [...k.split("\0"), n]).sort((p, q) => q[2] - p[2]);
  return {bands, chars, hit, months, by, first, pairs, cross, weak};
}

// ---------- 匯出檔 ----------
function fixMojibake(s) {
  // Meta 匯出檔的老毛病：UTF-8 的每個位元組各寫成一個 \u00XX；整串都在 U+00FF 以下才當亂碼修
  if (!/[\u0080-ÿ]/.test(s) || /[Ā-￿]/.test(s)) return s;
  try { return new TextDecoder("utf-8", {fatal: true}).decode(Uint8Array.from(s, ch => ch.charCodeAt(0))); } catch { return s; }
}

const looksLikePost = x => x && typeof x === "object" && !Array.isArray(x) && (Array.isArray(x.media) || ("title" in x && "creation_timestamp" in x));

function findPosts(o) {
  // 遞迴找第一個「每個元素都像貼文」的陣列——鍵名改了也還能用
  if (Array.isArray(o)) {
    if (o.length && o.every(looksLikePost)) return o;
    for (const x of o) { const r = findPosts(x); if (r) return r; }
  } else if (o && typeof o === "object") {
    for (const k in o) { const r = findPosts(o[k]); if (r) return r; }
  }
  return null;
}

function parseExport(obj) {
  // threads_and_replies.json → [{text, timestamp(ISO)}]。一個 entry 一篇；文字在 entry.title 或 media[].title（去重後串起來）
  const arr = Array.isArray(obj?.text_post_app_text_posts) ? obj.text_post_app_text_posts : findPosts(obj);
  if (!arr) throw new Error("找不到貼文：請選 threads_and_replies.json，匯出時格式要選 JSON 不是 HTML");
  return arr.map(e => {
    const items = [e, ...(Array.isArray(e.media) ? e.media : [])];
    const text = [...new Set(items.map(i => typeof i.title === "string" ? fixMojibake(i.title) : "").filter(Boolean))].join("\n");
    const ts = items.map(i => i.creation_timestamp).filter(t => typeof t === "number");
    const t = ts.length ? Math.min(...ts) : 0;
    return {text, timestamp: t ? new Date(t > 1e12 ? t : t * 1000).toISOString() : ""};
  });
}

// ---------- 圖 ----------
const LOGO_MIN = .08;  // 扇形占比低於這個放不下 logo，就用團代表色
const light = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 255000 > .6; };

function pieChart(items, colors, photos = {}) {
  // 扇形裡直接放團 logo（≥8% 才放得下）；百分比字放 logo 下面，太小的扇形只留圖例
  const tot = items.reduce((s, [, n]) => s + n, 0) || 1, C = 100, R = 90;
  const label = (name, s, m, fg) => {
    const r = s >= 1 ? 0 : R * .6, cx = C + r * Math.cos(m), cy = C + r * Math.sin(m), o = [];
    const logo = photos[name] && s >= LOGO_MIN;
    let h = 0;
    if (logo) {
      const w = s >= 1 ? 90 : Math.min(60, Math.max(28, 2 * r * Math.sin(Math.PI * s) * .9)); h = w * .42;
      o.push(`<image data-band="${esc(name)}" href="${esc(photos[name])}" x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`);
    }
    if (s >= .06 && (!logo || s >= .14)) o.push(`<text data-band="${esc(name)}" x="${cx.toFixed(1)}" y="${(logo ? cy + h / 2 + 11 : cy + 4).toFixed(1)}" font-size="${logo ? 10 : 11}" font-weight="700" fill="${fg}" text-anchor="middle">${pct(s, 1, 0)}</text>`);
    return o.join("");
  };
  if (items.length === 1) return `<svg viewBox="0 0 200 200" role="img"><circle cx="${C}" cy="${C}" r="${R}" fill="${colors[0]}"><title>${esc(items[0][0])} 100%</title></circle>${label(items[0][0], 1, 0, light(colors[0]) ? "#241f26" : "#fff")}</svg>`;
  const out = ['<svg viewBox="0 0 200 200" role="img" aria-label="樂團分布">'], labels = [];
  let a = -Math.PI / 2;
  items.forEach(([name, n], i) => {
    const b = a + 2 * Math.PI * n / tot;
    const [x0, y0, x1, y1] = [C + R * Math.cos(a), C + R * Math.sin(a), C + R * Math.cos(b), C + R * Math.sin(b)].map(v => v.toFixed(1));
    out.push(`<path d="M${C},${C} L${x0},${y0} A${R},${R} 0 ${b - a > Math.PI ? 1 : 0},1 ${x1},${y1} Z" fill="${colors[i]}" data-band="${esc(name)}" stroke="var(--card)" stroke-width="1.5"><title>${esc(name)}：${n} 篇（${pct(n, tot, 0)}）</title></path>`);
    labels.push(label(name, n / tot, (a + b) / 2, light(colors[i]) ? "#241f26" : "#fff"));
    a = b;
  });
  return out.join("\n") + labels.join("") + "</svg>";  // logo 畫在所有扇形之後，才不會被鄰邊蓋到
}

function lineChart(series, months, colors) {
  // series: [[名字, {月: 篇數}]]
  const W = 960, H = 320, L = 40, R = 16, T = 16, B = 40;
  const top = Math.max(1, ...series.flatMap(([, m]) => Object.values(m)));
  const x = i => (L + i * (W - L - R) / Math.max(1, months.length - 1)).toFixed(1);
  const y = v => (T + (H - T - B) * (1 - v / top)).toFixed(1);
  const out = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每月篇數">`];
  for (let k = 0; k < 5; k++) {
    const v = Math.round(top * k / 4);
    out.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#8884" /><text x="${L - 6}" y="${+y(v) + 4}" font-size="11" text-anchor="end" fill="#888">${v}</text>`);
  }
  const step = Math.max(1, Math.floor(months.length / 12));
  months.forEach((m, i) => { if (i % step === 0) out.push(`<text x="${x(i)}" y="${H - 14}" font-size="11" text-anchor="middle" fill="#888">${m}</text>`); });
  series.forEach(([name, mc], k) => {
    const pts = months.map((m, i) => `${x(i)},${y(mc[m] || 0)}`).join(" ");
    if (k === 0) out.push(`<polygon points="${x(0)},${y(0)} ${pts} ${x(months.length - 1)},${y(0)}" fill="${colors[k]}" opacity=".12" />`);
    out.push(`<polyline points="${pts}" fill="none" stroke="${colors[k]}" stroke-width="2.5" stroke-linejoin="round" />`);
    months.forEach((m, i) => { if (mc[m]) out.push(`<circle cx="${x(i)}" cy="${y(mc[m])}" r="3.5" fill="${colors[k]}"><title>${esc(name)} ${m}：${mc[m]} 篇</title></circle>`); });
  });
  return out.join("\n") + "</svg>";
}

function addNav(out) {
  // 每個 <h2> 加 id、h1 下面插一條置頂導覽；封面和每個 h2 區塊各包成 <section class='sec'>，手機一區一截圖
  const ids = [];
  out = out.replace(/<h2>(.*?)<\/h2>/g, (_, t) => { ids.push([`s${ids.length}`, t]); return `<h2 id='${ids[ids.length - 1][0]}'>${t}</h2>`; });
  const nav = "<nav>" + ids.map(([i, t]) => `<a href='#${i}'>${t}</a>`).join("") + "</nav>";
  const fi = out.indexOf("<footer>"), parts = out.slice(0, fi).split(/(?=<h2 )/), cut = parts[0].indexOf("</h1>") + 5;
  const sec = p => `<section class='sec'>${p}</section>`;
  return parts[0].slice(0, cut) + nav + sec(parts[0].slice(cut)) + parts.slice(1).map(sec).join("") + out.slice(fi);
}

// ---------- 報告 ----------
function excerpt(p, c, n = 100) {
  // 貼文摘錄（n=Infinity 給全文，交給 CSS 截行、點了展開），對到的關鍵字包 <mark>（排除詞不標）
  const t = (p.text || "").replace(/\s+/g, " ").trim(), cut = t.length > n ? t.slice(0, n) + "…" : t;
  return esc(cut.replace(c.pat, m => c.lookup[m.toLowerCase()] === "!" ? m : `\u0001${m}\u0002`)).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
}
const day = p => (p.timestamp || "").slice(0, 10);

function render(posts, b, photos = {}) {
  const c = compile(b.names);
  const {bands, chars, hit, months, by, first, pairs, cross, weak} = analyze(posts, b, c);
  if (!hit) throw new Error(`共 ${posts.length} 篇，一篇都沒提到 BanG Dream!——去 bands.txt 補上你常用的叫法`);
  const total = Object.values(bands).reduce((s, n) => s + n, 0);
  const ranking = b.order.map(x => [x, bands[x] || 0]).sort((p, q) => q[1] - p[1]);  // 9 團都列，0 篇也算成分；平手照 bands.txt 順序
  const color = Object.fromEntries(ranking.map(([x], i) => [x, BAND_COLOR[x] || COLORS[i % COLORS.length]]));
  const palette = ranking.map(([x, n]) => photos[x] && n / total >= LOGO_MIN ? PIE_COLOR[x] || color[x] : color[x]);  // 沒 logo 的扇形用代表色
  const [topBand, topN] = ranking[0];
  const monthsAll = [...new Set(posts.map(p => (p.timestamp || "").slice(0, 7)).filter(Boolean))].sort();
  const members = band => Object.keys(b.bandOf).filter(n => b.bandOf[n] === band && n !== band);
  const newest = idx => [...idx].sort((p, q) => day(posts[q]).localeCompare(day(posts[p])));
  const postList = (idx, limit = 10) => { const s = newest(idx); return "<ul class='posts'>" + s.slice(0, limit).map(i => `<li><time>${day(posts[i])}</time><div class='ex'>${excerpt(posts[i], c, Infinity)}</div></li>`).join("") + "</ul>" + (s.length > limit ? `<p class='muted'>…還有 ${s.length - limit} 篇</p>` : ""); };
  const dot = x => `<i class='dot' style='background:${color[x]}'></i>`;

  const h = [`<h1>${esc(TITLE)}</h1>`,
    `<div class='chips'><span>📝 ${posts.length} 篇</span><span>📅 ${monthsAll[0] || "?"} ～ ${monthsAll[monthsAll.length - 1] || "?"}</span>` +
    `<span>🎯 ${pct(hit, posts.length)} 提到 BanG Dream!</span><span>💬 合計 ${total} 篇次</span></div>`,
    "<section class='cover'>" + pieChart(ranking, palette, photos).replace("<svg", "<svg class='pie'") +
    `<div><div class='muted'>🎸 本命樂團</div><div class='name'>${esc(topBand)}</div>` +
    `<div class='big'><b>${topN}</b> <span style='font-size:20px'>篇</span></div><div>占各團篇次 ${pct(topN, total)}</div>` +
    "<div class='legend' style='margin-top:14px;max-width:520px'>" +
    ranking.map(([x, n], i) => `<span><i data-band='${esc(x)}' style='background:${palette[i]}'></i>${esc(x)} <span class='muted'>${pct(n, total, 0)}</span></span>`).join("") +
    "</div></div></section>"];

  h.push("<h2>🎤 各團成分</h2><div class='rows'>");
  ranking.forEach(([band, n], i) => {
    const top3 = members(band).filter(x => chars[x]).map(x => [chars[x], x]).sort((p, q) => q[0] - p[0]).slice(0, 3);
    h.push(`<div class='rw${n ? "" : " zero"}'><span class='rank r${i + 1}'>#${i + 1}</span><div class='n'>${dot(band)}${esc(band)}</div><div class='v'><b>${pct(n, total, 0)}</b> <span class='muted'>${n} 篇</span></div>` +
      `<div class='bar'><i style='width:${pct(n, topN, 0)};background:${color[band]}'></i></div>` +
      (top3.length ? "<small>角色：" + top3.map(([k, x]) => `${esc(x)} ${k}`).join("、") + "</small>" : "") + "</div>");
  });
  h.push("</div>");

  if (monthsAll.length) {
    const series = ranking.map(([x]) => [x, months[x] || {}]);
    h.push("<h2>📈 變心曲線</h2><p class='muted'>每月各團篇數。</p><div class='chart'><div class='legend'>" +
      series.map(([x]) => `<span><i style='background:${color[x]}'></i>${esc(x)}</span>`).join("") + "</div>" + lineChart(series, monthsAll, ranking.map(([x]) => color[x])) + "</div>");
  }

  const top10 = Object.entries(chars).sort((p, q) => q[1] - p[1]).slice(0, 10);
  if (top10.length) {
    h.push("<h2>🏆 角色總排行</h2><div class='grid top3'>");
    top10.slice(0, 3).forEach(([x, n], i) => h.push(
      `<div class='card' style='border-top:6px solid ${color[b.bandOf[x]]}'><span class='rank r${i + 1}'>#${i + 1}</span>${img(photos, x) || "<div class='ph'></div>"}<div class='body'><div class='n'>${esc(x)}</div>` +
      `<small>${esc(b.bandOf[x])}</small><div class='bar'><i style='width:${pct(n, top10[0][1], 0)}'></i></div><div>${n} 篇</div></div></div>`));
    h.push("</div>");
    const all = Object.entries(chars).sort((p, q) => q[1] - p[1]);
    if (all.length > 3) {
      h.push(`<div class='tbl-wrap collapsed' id='chars' style='margin-top:16px'><table><tr><th>#</th><th>角色</th><th>團</th><th class='r'>篇數</th></tr>`);
      all.slice(3).forEach(([x, n], i) => h.push(`<tr${i + 3 >= 10 ? " class='more'" : ""}><td>${i + 4}</td><td><b>${esc(x)}</b></td><td title='${esc(b.bandOf[x])}'>${dot(b.bandOf[x])}</td><td class='r'>${n}</td></tr>`));
      h.push("</table>" + (all.length > 10 ? `<p style='text-align:center;margin:12px 0 0'><button class='btn ghost sm' id='showall' data-n='${all.length}'>顯示全部 ${all.length} 位</button></p>` : "") + "</div>");
    }
  }

  if (pairs.length || cross) {
    h.push(`<h2>👯 同框</h2><p class='muted'>同一篇提到兩位以上角色。跨團同框 ${cross} 篇，占提到邦邦的 ${pct(cross, hit, 0)}。</p>`);
    if (pairs.length) h.push("<div class='chips'>" + pairs.slice(0, 10).map(([a, q, n]) => `<span>${dot(b.bandOf[a])}${esc(a)} × ${dot(b.bandOf[q])}${esc(q)} <span class='muted'>${n} 篇</span></span>`).join("") + "</div>");
  }

  const tl = ranking.filter(([x, n]) => n && first[x]).sort((p, q) => first[p[0]].localeCompare(first[q[0]]));
  if (tl.length) {
    h.push("<h2>🗓️ 首篇貼文</h2><ol class='tl'>" +
      tl.map(([x]) => { const i = by[x].reduce((a, j) => (posts[j].timestamp < posts[a].timestamp ? j : a)); return `<li><time>${first[x].slice(0, 10)}</time><div><b style='color:${color[x]}'>${esc(x)}</b><div class='ex muted'>${excerpt(posts[i], c, Infinity)}</div></div></li>`; }).join("") + "</ol>");
  }

  h.push("<h2>📚 命中貼文</h2><p class='muted'>每團、每位角色最近 10 篇，<mark>標記</mark>是對到的關鍵字。數字不對勁就從這裡找原因。</p>");
  for (const [band, n] of ranking) if (n) h.push(`<details class='hits'><summary>${dot(band)}${esc(band)} <span class='muted'>${n} 篇</span></summary>` + postList(by[band]) +
    members(band).filter(x => chars[x]).sort((p, q) => chars[q] - chars[p]).map(x => `<details><summary>${esc(x)} <span class='muted'>${chars[x]} 篇</span></summary>${postList(by[x])}</details>`).join("") + "</details>");

  if (weak.length) {
    h.push(`<h2>🔍 待確認</h2><p class='muted'>這 ${weak.length} 篇只靠單字或短假名對到（巴、彩、蘭、燈、ひな…），最容易誤判。不是在講邦邦的話，把那個詞加進該角色的排除詞。</p><ul class='posts weak'>` +
      newest(weak.map(w => w.i)).slice(0, 50).map(i => { const w = weak.find(w => w.i === i); return `<li><time>${day(posts[i])}</time><div class='ex'>${excerpt(posts[i], c, Infinity)}</div><div class='row' style='margin-top:6px'>${w.names.map(n => `<button class='btn ghost sm' data-who='${esc(n)}'>改「${esc(n)}」的關鍵字</button>`).join("")}</div></li>`; }).join("") +
      "</ul>" + (weak.length > 50 ? `<p class='muted'>…還有 ${weak.length - 50} 篇</p>` : ""));
  }

  h.push(`<footer>產生於 ${new Date().toISOString().slice(0, 10)} · ${GITHUB}</footer>`);
  return addNav(h.join("\n"));
}

// ---------- 自我檢查 ----------
function demo(bandsTxt) {
  const assert = (ok, msg) => { if (!ok) throw new Error("demo 失敗：" + msg); };
  const b = loadBands(bandsTxt);
  assert(b.bandOf["Poppin'Party"] === "Poppin'Party" && b.bandOf["戸山香澄"] === "Poppin'Party", "bandOf");
  assert(b.names["ポピパ"] === "Poppin'Party" && b.names["Kasumi"] === "戸山香澄" && b.names["電燈"] === "!", "names");
  assert(b.order.length === 9, "9 團：" + b.order.join(","));

  const moji = s => Buffer.from(s, "utf8").toString("latin1");  // 模擬 Meta 的 \u00XX 亂碼
  const exp = {text_post_app_text_posts: [
    {media: [{uri: "", creation_timestamp: 1777593600, title: moji("ポピパ的香澄跟有咲太好了")}]},            // 2026-05-01
    {media: [{uri: "media/a.jpg", creation_timestamp: 1777680000, title: "彩彩 彩彩 丸山彩"}]},             // 2026-05-02
    {title: "MyGO 燈跟祥子 Ave Mujica 同框 https://www.threads.com/@x/post/1", creation_timestamp: 1780358400},  // 2026-06-02
    {media: [{uri: "media/b.jpg", creation_timestamp: 1780444800, title: "電燈壞了 今天天氣真好"}]},         // 排除詞：電燈 不算 燈
    {title: "backstage again, instagram page", creation_timestamp: 1780531200},                                // 英文要整個字：stage/again 不算 Ag
    {title: "巴好帥", creation_timestamp: 1780617600},                                                              // 2026-06-05 只靠單字「巴」→ 待確認
  ]};
  const posts = parseExport(exp);
  assert(posts.length === 6 && posts[0].text === "ポピパ的香澄跟有咲太好了" && posts[0].timestamp.startsWith("2026-05-01"), JSON.stringify(posts[0]));
  assert(parseExport({foo: {bar: exp.text_post_app_text_posts}}).length === 6, "鍵名不同也找得到");
  let threw = false; try { parseExport({a: 1}); } catch { threw = true; } assert(threw, "不像匯出檔要報錯");

  const r = analyze(posts, b, compile(b.names));
  assert(r.hit === 4, "hit=" + r.hit);
  assert(JSON.stringify(r.bands) === JSON.stringify({"Poppin'Party": 1, "Pastel*Palettes": 1, "MyGO!!!!!": 1, "Ave Mujica": 1, "Afterglow": 1}), JSON.stringify(r.bands));  // 一篇兩團各算 1
  assert(r.cross === 1 && JSON.stringify(r.pairs) === JSON.stringify([["市ヶ谷有咲", "戸山香澄", 1], ["豊川祥子", "高松燈", 1]]), JSON.stringify(r.pairs));  // 同框：同篇兩角色
  assert(r.weak.length === 1 && r.weak[0].aliases.join() === "巴" && r.weak[0].names.join() === "宇田川巴", JSON.stringify(r.weak));  // 只靠單字對到
  assert(r.first["Afterglow"].startsWith("2026-06-05") && r.first["MyGO!!!!!"].startsWith("2026-06-02") && r.by["Ave Mujica"].length === 1, JSON.stringify(r.first));
  assert(r.chars["丸山彩"] === 1 && r.chars["戸山香澄"] === 1 && r.chars["高松燈"] === 1 && r.chars["豊川祥子"] === 1, JSON.stringify(r.chars));  // 同篇多別名只算 1 篇
  assert(JSON.stringify(r.months["MyGO!!!!!"]) === JSON.stringify({"2026-06": 1}), JSON.stringify(r.months));

  const out = render(posts, b);
  assert(out.includes("<div class='name'>Poppin&#x27;Party</div>"), "五團平手，照 bands.txt 順序 Poppin'Party 先");
  assert(out.includes("👯 同框") && out.includes("🗓️ 首篇貼文") && out.includes("📚 命中貼文") && out.includes("🔍 待確認") && out.includes("data-who='宇田川巴'"), "新區塊都在");
  assert(out.includes("<mark>香澄</mark>") && (out.match(/<section class='sec'>/g) || []).length === 8 && out.includes("class='rw zero'") && out.includes("<th>團</th>"), "摘錄標記、section、0 篇列變淡、角色表");
  assert((out.match(/class='rw( zero)?'/g) || []).length === 9 && (out.match(/class='card'/g) || []).length === 3 && out.includes("<path d=") && out.includes("<polyline"), "9 行團 + 前 3 名角色卡、圓餅、折線");
  assert(out.includes("<nav>") && out.includes("id='s0'") && out.includes("角色總排行"), "導覽與排行");
  assert(out.includes("<i data-band='ハロー、ハッピーワールド！' style='background:#ffcc00'></i>ハロー、ハッピーワールド！ <span class='muted'>0%"), "封面圖例列全部 9 團含 0 篇");
  assert(out.includes('fill="#ff9ecb"') && out.includes('stroke="#ff9ecb"') && !out.includes('fill="#ffd6e6"'), "沒 logo：圓餅、折線都用代表色");
  assert(out.includes("<div class='ph'></div>") && !out.includes("<img"), "沒給 photos：角色卡空框、圓餅沒 logo");
  const photos = loadPhotos("# 註解\n戸山香澄=https://p/kasumi.png\nPoppin'Party=https://p/popipa.svg\n");
  const out2 = render(posts, b, photos);
  assert(out2.includes('src="https://p/kasumi.png"') && (out2.match(/<img/g) || []).length === 1 && out2.includes('href="https://p/popipa.svg"') && out2.includes('fill="#ffd0c2" data-band="Poppin&#x27;Party"') && out2.includes('fill="#241f26"'), "有 logo 的扇形才用粉彩底、字變深色");
  return "demo OK";
}

if (typeof module !== "undefined") {
  module.exports = {loadBands, loadPhotos, compile, analyze, parseExport, fixMojibake, render, demo, pieChart, PIE_COLOR};
  if (require.main === module && process.argv.includes("--demo"))
    console.log(demo(require("fs").readFileSync(require("path").join(__dirname, "bands.txt"), "utf8")));
}
