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
const COLORS = ["#e0507a", "#4c8fdc", "#f0a43a", "#3fb28f", "#9a6ee0", "#e8733a", "#38b6c9", "#c9a23a", "#7a7a7a", "#d05fbf"];
const TITLE = "我的 BanG Dream! 成分";

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

function* mentions(posts, c) {
  for (const p of posts) {
    const found = {};
    for (const m of textOf(p).match(c.pat) || []) {
      const k = c.lookup[m.toLowerCase()];
      if (k !== "!") found[k] = (found[k] || 0) + 1;
    }
    yield [p, found];
  }
}

function analyze(posts, b, c) {
  // 回傳 {bands: {樂團: 篇}, chars: {角色: 篇}, hit: 有提到的篇數, months: {樂團: {YYYY-MM: 篇}}}
  const bands = {}, chars = {}, months = {};
  let hit = 0;
  for (const [p, found] of mentions(posts, c)) {
    const names = Object.keys(found);
    if (!names.length) continue;
    hit++;
    const hb = new Set(names.map(n => b.bandOf[n]));
    for (const x of hb) {
      bands[x] = (bands[x] || 0) + 1;
      const ym = (p.timestamp || "").slice(0, 7);
      (months[x] = months[x] || {})[ym] = (months[x][ym] || 0) + 1;
    }
    for (const n of names) if (b.bandOf[n] !== n) chars[n] = (chars[n] || 0) + 1;
  }
  return {bands, chars, hit, months};
}

function aliasUsage(posts, c) {
  // {正式名: {別名: 次數}}，同篇多次都算——看的是你習慣怎麼叫
  const usage = {};
  for (const p of posts)
    for (const m of textOf(p).match(c.pat) || []) {
      const k = m.toLowerCase(), canon = c.lookup[k];
      if (canon === "!") continue;
      (usage[canon] = usage[canon] || {})[c.spell[k]] = (usage[canon][c.spell[k]] || 0) + 1;
    }
  return usage;
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
function pieChart(items, colors) {
  const tot = items.reduce((s, [, n]) => s + n, 0) || 1, C = 100, R = 90;
  if (items.length === 1) return `<svg viewBox="0 0 200 200" role="img"><circle cx="${C}" cy="${C}" r="${R}" fill="${colors[0]}"><title>${esc(items[0][0])} 100%</title></circle></svg>`;
  const out = ['<svg viewBox="0 0 200 200" role="img" aria-label="樂團分布">'];
  let a = -Math.PI / 2;
  items.forEach(([name, n], i) => {
    const b = a + 2 * Math.PI * n / tot;
    const [x0, y0, x1, y1] = [C + R * Math.cos(a), C + R * Math.sin(a), C + R * Math.cos(b), C + R * Math.sin(b)].map(v => v.toFixed(1));
    out.push(`<path d="M${C},${C} L${x0},${y0} A${R},${R} 0 ${b - a > Math.PI ? 1 : 0},1 ${x1},${y1} Z" fill="${colors[i]}" stroke="var(--card)" stroke-width="1.5"><title>${esc(name)}：${n} 篇（${pct(n, tot, 0)}）</title></path>`);
    if (n / tot >= 0.06) {
      const m = (a + b) / 2;
      out.push(`<text x="${(C + R * .62 * Math.cos(m)).toFixed(1)}" y="${(C + R * .62 * Math.sin(m) + 4).toFixed(1)}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">${pct(n, tot, 0)}</text>`);
    }
    a = b;
  });
  return out.join("\n") + "</svg>";
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
  // 每個 <h2> 加 id，chips 前面插一條置頂導覽
  const ids = [];
  out = out.replace(/<h2>(.*?)<\/h2>/g, (_, t) => { ids.push([`s${ids.length}`, t]); return `<h2 id='${ids[ids.length - 1][0]}'>${t}</h2>`; });
  const nav = "<nav>" + ids.map(([i, t]) => `<a href='#${i}'>${t}</a>`).join("") + "</nav>";
  return out.replace("<div class='chips'>", nav + "<div class='chips'>");
}

// ---------- 報告 ----------
function render(posts, b, photos = {}) {
  const c = compile(b.names);
  const {bands, chars, hit, months} = analyze(posts, b, c);
  if (!hit) throw new Error(`共 ${posts.length} 篇，一篇都沒提到 BanG Dream!——去 bands.txt 補上你常用的叫法`);
  const total = Object.values(bands).reduce((s, n) => s + n, 0);
  const ranking = b.order.map(x => [x, bands[x] || 0]).sort((p, q) => q[1] - p[1]);  // 9 團都列，0 篇也算成分；平手照 bands.txt 順序
  const color = Object.fromEntries(ranking.map(([x], i) => [x, BAND_COLOR[x] || COLORS[i % COLORS.length]]));
  const palette = ranking.map(([x]) => color[x]);
  const [topBand, topN] = ranking[0];
  const monthsAll = [...new Set(posts.map(p => (p.timestamp || "").slice(0, 7)).filter(Boolean))].sort();
  const usage = aliasUsage(posts, c);
  const members = band => Object.keys(b.bandOf).filter(n => b.bandOf[n] === band && n !== band);

  const h = [`<h1>${esc(TITLE)}</h1>`,
    `<div class='chips'><span>📝 ${posts.length} 篇</span><span>📅 ${monthsAll[0] || "?"} ～ ${monthsAll[monthsAll.length - 1] || "?"}</span>` +
    `<span>🎯 ${pct(hit, posts.length)} 提到 BanG Dream!</span><span>💬 合計 ${total} 篇次</span></div>`,
    "<section class='cover'>" + pieChart(ranking, palette).replace("<svg", "<svg style='width:240px;flex:none'") +
    `<div><div class='muted'>🎸 本命樂團</div><div class='name'>${esc(topBand)}</div>` +
    `<div class='big'><b>${topN}</b> <span style='font-size:20px'>篇</span></div><div>占各團篇次 ${pct(topN, total)}</div>` +
    "<div class='legend' style='margin-top:14px;max-width:520px'>" +
    ranking.map(([x, n]) => `<span><i style='background:${color[x]}'></i>${esc(x)} <span class='muted'>${n} 篇 · ${pct(n, total, 0)}</span></span>`).join("") +
    "</div></div></section>"];

  h.push("<h2>🎤 各團成分</h2><div class='grid bands'>");
  ranking.forEach(([band, n], i) => {
    const top3 = members(band).filter(x => chars[x]).map(x => [chars[x], x]).sort((p, q) => q[0] - p[0]).slice(0, 3);
    const u = {};
    for (const x of [band, ...members(band)]) for (const [a, k] of Object.entries(usage[x] || {})) u[a] = (u[a] || 0) + k;
    const ul = Object.entries(u).sort((p, q) => q[1] - p[1]), utot = ul.reduce((s, [, k]) => s + k, 0) || 1;
    h.push(`<div class='card' style='border-top:6px solid ${color[band]}'><span class='rank r${i + 1}'>#${i + 1}</span><div class='logo'>${img(photos, band)}</div><div class='body'><div class='n'>${esc(band)}</div>` +
      `<div class='bar'><i style='width:${pct(n, topN, 0)}'></i></div><div>${n} 篇 <span class='muted'>${pct(n, total)}</span></div>` +
      (top3.length ? "<small>角色：" + top3.map(([k, x]) => `${esc(x)} ${k}`).join("、") + "</small>" : "") +
      (ul.length ? "<small>關鍵字：" + ul.slice(0, 5).map(([a, k]) => `${esc(a)} <span class='muted'>${pct(k, utot, 0)}</span>`).join("、") + "</small>" : "") +
      "</div></div>");
  });
  h.push("</div>");

  if (monthsAll.length) {
    const series = ranking.map(([x]) => [x, months[x] || {}]);
    h.push("<h2>📈 變心曲線</h2><p class='muted'>每月各團篇數。</p><div class='chart'><div class='legend'>" +
      series.map(([x]) => `<span><i style='background:${color[x]}'></i>${esc(x)}</span>`).join("") + "</div>" + lineChart(series, monthsAll, palette) + "</div>");
  }

  const top10 = Object.entries(chars).sort((p, q) => q[1] - p[1]).slice(0, 10);
  if (top10.length) {
    h.push("<h2>🏆 角色總排行</h2><div class='grid top3'>");
    top10.slice(0, 3).forEach(([x, n], i) => h.push(
      `<div class='card' style='border-top:6px solid ${color[b.bandOf[x]]}'><span class='rank r${i + 1}'>#${i + 1}</span>${img(photos, x) || "<div class='ph'></div>"}<div class='body'><div class='n'>${esc(x)}</div>` +
      `<small>${esc(b.bandOf[x])}</small><div class='bar'><i style='width:${pct(n, top10[0][1], 0)}'></i></div><div>${n} 篇</div></div></div>`));
    h.push("</div>");
    if (top10.length > 3) {
      h.push("<div class='tbl-wrap' style='margin-top:16px'><table><tr><th>#</th><th>角色</th><th>樂團</th><th class='r'>篇數</th></tr>");
      top10.slice(3).forEach(([x, n], i) => h.push(`<tr><td>${i + 4}</td><td><b>${esc(x)}</b></td><td class='muted'>${esc(b.bandOf[x])}</td><td class='r'>${n}</td></tr>`));
      h.push("</table></div>");
    }
  }
  h.push(`<footer>產生於 ${new Date().toISOString().slice(0, 10)}</footer>`);
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
  ]};
  const posts = parseExport(exp);
  assert(posts.length === 5 && posts[0].text === "ポピパ的香澄跟有咲太好了" && posts[0].timestamp.startsWith("2026-05-01"), JSON.stringify(posts[0]));
  assert(parseExport({foo: {bar: exp.text_post_app_text_posts}}).length === 5, "鍵名不同也找得到");
  let threw = false; try { parseExport({a: 1}); } catch { threw = true; } assert(threw, "不像匯出檔要報錯");

  const r = analyze(posts, b, compile(b.names));
  assert(r.hit === 3, "hit=" + r.hit);
  assert(JSON.stringify(r.bands) === JSON.stringify({"Poppin'Party": 1, "Pastel*Palettes": 1, "MyGO!!!!!": 1, "Ave Mujica": 1}), JSON.stringify(r.bands));  // 一篇兩團各算 1
  assert(r.chars["丸山彩"] === 1 && r.chars["戸山香澄"] === 1 && r.chars["高松燈"] === 1 && r.chars["豊川祥子"] === 1, JSON.stringify(r.chars));  // 同篇多別名只算 1 篇
  assert(JSON.stringify(r.months["MyGO!!!!!"]) === JSON.stringify({"2026-06": 1}), JSON.stringify(r.months));

  const out = render(posts, b);
  assert(out.includes("<div class='name'>Poppin&#x27;Party</div>"), "四團平手，照 bands.txt 順序 Poppin'Party 先");
  assert((out.match(/class='card'/g) || []).length === 12 && out.includes("<path d=") && out.includes("<polyline"), "9 張團卡 + 前 3 名角色卡、圓餅、折線");
  assert(out.includes("關鍵字：彩彩 <span class='muted'>67%</span>"), "稱呼習慣：彩彩 2 次 / 丸山彩 1 次");
  assert(out.includes("<nav>") && out.includes("id='s0'") && out.includes("角色總排行"), "導覽與排行");
  assert(out.includes("<i style='background:#ffcc00'></i>ハロー、ハッピーワールド！ <span class='muted'>0 篇 · 0%"), "封面圖例列全部 9 團含 0 篇");
  assert(out.includes('fill="#ff9ecb"') && out.includes('stroke="#ff9ecb"'), "Pastel*Palettes 的圓餅扇形和折線用代表色");
  assert(out.includes("<div class='ph'></div>") && !out.includes("<img"), "沒給 photos：角色卡空框、團卡沒 logo");
  const photos = loadPhotos("# 註解\n戸山香澄=https://p/kasumi.png\nPoppin'Party=https://p/popipa.svg\n");
  const out2 = render(posts, b, photos);
  assert(out2.includes('src="https://p/kasumi.png"') && out2.includes('src="https://p/popipa.svg"') && (out2.match(/<img/g) || []).length === 2, "有網址的才放圖");
  return "demo OK";
}

if (typeof module !== "undefined") {
  module.exports = {loadBands, loadPhotos, compile, analyze, aliasUsage, parseExport, fixMojibake, render, demo};
  if (require.main === module && process.argv.includes("--demo"))
    console.log(demo(require("fs").readFileSync(require("path").join(__dirname, "bands.txt"), "utf8")));
}
