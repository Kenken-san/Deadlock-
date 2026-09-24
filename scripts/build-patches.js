// パッチJSON（data/patches/）から静的HTMLを生成する。
//  - patches/<date>.html : パッチごとの個別ページ（SEO用に本文をHTMLへ焼き込み）
//  - patch-notes.html    : 最新パッチを静的表示＋全パッチへのリンク集（ハブ）
//  - sitemap.xml         : 全ページ＋全パッチページを自動登録
// 使い方: node scripts/build-patches.js  （リポジトリのルートから、または任意の場所から）

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PATCH_DIR = path.join(ROOT, 'data', 'patches');
const OUT_DIR = path.join(ROOT, 'patches');
const SITE = 'https://deadlock-jp.com';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 共通スタイル（サイトのダークテーマ）
const STYLE = `
    :root{--bg:#0b0d10;--panel:rgba(255,255,255,0.06);--text:#f5f7fa;--muted:#aab3c2;--accent:#ffb84d;--line:rgba(255,255,255,0.12);--shadow:0 20px 50px rgba(0,0,0,0.35);--radius:22px;--max:1180px;}
    *{box-sizing:border-box;}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif;background:radial-gradient(circle at top left,rgba(255,184,77,0.12),transparent 28%),radial-gradient(circle at top right,rgba(110,168,254,0.10),transparent 20%),linear-gradient(180deg,#0b0d10 0%,#10141a 100%);color:var(--text);line-height:1.65;}
    a{color:inherit;}
    .container{width:min(calc(100% - 32px),var(--max));margin:0 auto;}
    .site-nav{background:rgba(255,255,255,0.04);border-bottom:1px solid var(--line);padding:0 clamp(1rem,4vw,3rem);display:flex;align-items:center;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px);flex-wrap:wrap;}
    .site-nav a{color:var(--muted);text-decoration:none;padding:1rem 1.25rem;font-size:0.9rem;border-bottom:2px solid transparent;transition:color .2s,border-color .2s;}
    .site-nav a:hover,.site-nav a.active{color:var(--accent);border-bottom-color:var(--accent);}
    .hero{padding:64px 0 24px;}
    .eyebrow{display:inline-block;padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:rgba(255,255,255,0.04);font-size:0.88rem;margin-bottom:18px;}
    h1{margin:0 0 14px;font-size:clamp(1.9rem,5vw,3.4rem);line-height:1.08;letter-spacing:-0.03em;}
    .lead{margin:0 0 8px;color:var(--muted);font-size:1.05rem;max-width:62ch;}
    .breadcrumb{color:var(--muted);font-size:0.85rem;margin-bottom:10px;}
    .breadcrumb a{color:var(--muted);}
    .section{padding:18px 0 40px;}
    .section-title h2{margin:0 0 18px;font-size:clamp(1.3rem,3vw,1.9rem);letter-spacing:-0.02em;}
    .patch-list{display:flex;flex-direction:column;gap:14px;}
    .patch-entry{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:1.25rem 1.5rem;box-shadow:var(--shadow);}
    .patch-entry h3{margin:0 0 10px;font-size:1.1rem;color:var(--accent);}
    .patch-entry ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px;}
    .patch-entry li{color:var(--muted);font-size:0.96rem;}
    .patch-entry li::before{content:"▸ ";color:var(--accent);}
    .archive-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;}
    .archive-links a{background:var(--panel);border:1px solid var(--line);border-radius:999px;color:var(--muted);padding:6px 16px;font-size:0.9rem;text-decoration:none;transition:border-color .2s,color .2s;}
    .archive-links a:hover,.archive-links a.current{border-color:var(--accent);color:var(--accent);}
    .patch-nav{display:flex;justify-content:space-between;gap:12px;margin-top:28px;flex-wrap:wrap;}
    .patch-nav a{background:var(--panel);border:1px solid var(--line);border-radius:14px;color:var(--text);padding:12px 18px;text-decoration:none;font-size:0.92rem;transition:border-color .2s;}
    .patch-nav a:hover{border-color:var(--accent);}
    footer{padding:20px 0 42px;color:var(--muted);font-size:0.92rem;}
    .footer-box{border-top:1px solid var(--line);padding-top:18px;}
    @media (max-width:900px){.section-title{display:block;}}
`;

// 個別パッチページ用ナビ（1階層下なので ../ を付ける）
const NAV_SUB = () => `  <nav class="site-nav">
    <a href="../index.html">ホーム</a>
    <a href="../heroes.html">ヒーロー統計</a>
    <a href="../tier-list.html">Tier List</a>
    <a href="../patch-notes.html">パッチノート翻訳</a>
    <a href="../counter-items.html">カウンター対策</a>
  </nav>`;

// ハブ用ナビ（同階層）
const NAV_HUB = () => `  <nav class="site-nav">
    <a href="index.html">ホーム</a>
    <a href="heroes.html">ヒーロー統計</a>
    <a href="tier-list.html">Tier List</a>
    <a href="patch-notes.html" class="active">パッチノート翻訳</a>
    <a href="counter-items.html">カウンター対策</a>
  </nav>`;

function renderSections(patch) {
  return `<div class="patch-list">
${patch.heroes.map(h => `        <div class="patch-entry">
          <h3>${esc(h.name)}</h3>
          <ul>
${h.changes.map(c => `            <li>${esc(c)}</li>`).join('\n')}
          </ul>
        </div>`).join('\n')}
      </div>`;
}

function metaDescription(patch) {
  const names = patch.heroes.map(h => h.name).filter(n => !['全般','アイテム','概要'].includes(n));
  const total = patch.heroes.reduce((a, h) => a + h.changes.length, 0);
  const head = names.slice(0, 6).join('・');
  return `Deadlock ${patch.label}の変更点を日本語で掲載。${head ? head + 'など' : ''}全${total}件のバランス調整を翻訳。`;
}

function buildPatchPage(patch, date, prev, next) {
  const title = `Deadlock ${patch.label} 日本語翻訳｜Deadlockers`;
  const desc = metaDescription(patch);
  const url = `${SITE}/patches/${date}.html`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": `Deadlock ${patch.label} 日本語翻訳`,
    "datePublished": date,
    "inLanguage": "ja",
    "author": { "@type": "Organization", "name": "Deadlockers" },
    "publisher": { "@type": "Organization", "name": "Deadlockers" },
    "mainEntityOfPage": url,
    "description": desc
  };
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:site_name" content="Deadlockers" />
  <meta property="og:locale" content="ja_JP" />
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <style>${STYLE}</style>
</head>
<body>
${NAV_SUB()}

  <header class="hero">
    <div class="container">
      <div class="breadcrumb"><a href="../index.html">ホーム</a> › <a href="../patch-notes.html">パッチノート翻訳</a> › ${esc(patch.label)}</div>
      <h1>Deadlock ${esc(patch.label)}<br>日本語翻訳</h1>
      <p class="lead">Deadlockの${esc(patch.label)}における全変更点を日本語に翻訳して掲載しています。翻訳元: Valve公式パッチノート</p>
    </div>
  </header>

  <main>
    <section class="section">
      <div class="container">
        ${renderSections(patch)}
        <div class="patch-nav">
          ${next ? `<a href="${next.date}.html">← ${esc(next.label)}</a>` : '<span></span>'}
          <a href="../patch-notes.html">パッチノート一覧</a>
          ${prev ? `<a href="${prev.date}.html">${esc(prev.label)} →</a>` : '<span></span>'}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container footer-box">
      非公式ファンサイト。DeadlockはValve Corporationの商標です。
    </div>
  </footer>
</body>
</html>
`;
}

function buildHub(patches) {
  const latest = patches[0];
  const title = 'Deadlock パッチノート翻訳（最新）｜日本語ファンサイト';
  const desc = `Deadlockの最新パッチノートを日本語に翻訳して掲載。${latest.label}まで対応。過去パッチのアーカイブも全件掲載しています。`;
  const url = `${SITE}/patch-notes.html`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Deadlock パッチノート翻訳",
    "inLanguage": "ja",
    "url": url,
    "description": desc
  };
  const archive = patches.map(p =>
    `<a href="patches/${p.date}.html"${p===latest?' class="current"':''}>${esc(p.label)}</a>`
  ).join('\n          ');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:site_name" content="Deadlockers" />
  <meta property="og:locale" content="ja_JP" />
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <style>${STYLE}</style>
</head>
<body>
${NAV_HUB()}

  <header class="hero">
    <div class="container">
      <div class="eyebrow">Deadlock Fan Site / パッチノート翻訳</div>
      <h1>パッチノート<br>日本語翻訳</h1>
      <p class="lead">Deadlockの最新パッチノートを日本語に翻訳して掲載しています。翻訳元: Valve公式パッチノート</p>
    </div>
  </header>

  <main>
    <section class="section">
      <div class="container">
        <div class="section-title"><h2>${esc(latest.label)}（最新）</h2></div>
        ${renderSections(latest)}
      </div>
    </section>

    <section class="section" style="padding-top:0;">
      <div class="container">
        <div class="section-title"><h2>過去のパッチノート</h2></div>
        <div class="archive-links">
          ${archive}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container footer-box">
      非公式ファンサイト。DeadlockはValve Corporationの商標です。
    </div>
  </footer>
</body>
</html>
`;
}

function buildSitemap(patches) {
  const today = new Date().toISOString().slice(0, 10);
  const staticPages = [
    { loc: `${SITE}/`, pri: '1.0', mod: today },
    { loc: `${SITE}/heroes.html`, pri: '0.9', mod: today },
    { loc: `${SITE}/tier-list.html`, pri: '0.8', mod: today },
    { loc: `${SITE}/patch-notes.html`, pri: '0.9', mod: today },
    { loc: `${SITE}/counter-items.html`, pri: '0.7', mod: '2026-04-21' },
  ];
  const patchPages = patches.map(p => ({ loc: `${SITE}/patches/${p.date}.html`, pri: '0.7', mod: p.date }));
  const all = staticPages.concat(patchPages);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.mod}</lastmod>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

function main() {
  const index = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, 'index.json'), 'utf8'));
  const patches = index.map(date => {
    const p = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, date + '.json'), 'utf8'));
    p.date = date;
    return p;
  });

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 個別パッチページ（prev=より古い, next=より新しい。index は新しい順）
  patches.forEach((p, i) => {
    const next = i > 0 ? patches[i - 1] : null;   // より新しい
    const prev = i < patches.length - 1 ? patches[i + 1] : null; // より古い
    fs.writeFileSync(path.join(OUT_DIR, p.date + '.html'), buildPatchPage(p, p.date, prev, next), 'utf8');
  });

  // ハブ
  fs.writeFileSync(path.join(ROOT, 'patch-notes.html'), buildHub(patches), 'utf8');

  // サイトマップ
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(patches), 'utf8');

  console.log(`generated ${patches.length} patch pages + patch-notes.html + sitemap.xml`);
}

main();
