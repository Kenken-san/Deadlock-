// 最新パッチをXへ自動投稿する。data/patches/index.json の先頭（最新）を対象に、
// data/last-tweeted.txt と比較して未投稿なら投稿し、投稿済み日付を記録する（重複投稿防止）。
// 認証は X API v2 OAuth 1.0a User Context（環境変数の4キー）。
// 使い方: node scripts/post-to-x.js
//   環境変数: X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET
//   任意: FORCE=1 で last-tweeted.txt を無視して強制投稿

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TwitterApi } from 'twitter-api-v2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PATCH_DIR = path.join(ROOT, 'data', 'patches');
const STATE_FILE = path.join(ROOT, 'data', 'last-tweeted.txt');
const SITE = 'https://deadlock-jp.com';

// X の重み付き文字数（CJKは2、URLは23固定、他は1）で概算
function weightedLen(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    // CJK統合漢字・かな・全角記号などを2とみなす簡易判定
    if (c >= 0x1100 && (
      (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x3000 && c <= 0x30ff)
    )) n += 2; else n += 1;
  }
  return n;
}

function buildTweet(patch, date) {
  const url = `${SITE}/patches/${date}.html`;
  const URL_WEIGHT = 23; // t.co 短縮後の固定長
  const heroNames = patch.heroes
    .map(h => h.name)
    .filter(n => !['全般', 'アイテム', '概要'].includes(n));
  const hasItems = patch.heroes.some(h => h.name === 'アイテム');
  const total = patch.heroes.reduce((a, h) => a + h.changes.length, 0);

  const header = `【Deadlock ${patch.label} 日本語訳】`;
  const line1 = `全${total}項目の変更を日本語でまとめました📝`;
  const tags = `#Deadlock #デッドロック`;

  // ヒーロー名は代表数体のみ。全体数も添えて簡潔に。
  function assemble(sampleCount) {
    let heroLine = '';
    if (heroNames.length) {
      const sample = heroNames.slice(0, sampleCount);
      const more = heroNames.length > sample.length ? `ほか全${heroNames.length}ヒーロー` : '';
      heroLine = `🦸 ${sample.join('・')}${more ? '　' + more : ''}${hasItems ? '＋アイテム' : ''} 調整`;
    } else if (hasItems) {
      heroLine = '🛠 アイテム調整';
    }
    const parts = [header, line1, heroLine, '全文👇', tags].filter(Boolean);
    const text = parts.join('\n');
    const body = text.replace('全文👇', `全文👇\n${url}`);
    const weight = weightedLen(text) + 1 /*改行*/ + URL_WEIGHT;
    return { body, weight };
  }

  // 代表5体から始め、上限(280重み)に収まるまで減らす
  let n = Math.min(5, heroNames.length);
  let r = assemble(n);
  while (r.weight > 278 && n > 1) {
    n -= 1;
    r = assemble(n);
  }
  return r.body;
}

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, 'index.json'), 'utf8'));
  const latest = index[0];
  const patch = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, latest + '.json'), 'utf8'));

  const last = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, 'utf8').trim() : '';
  if (last === latest && process.env.FORCE !== '1') {
    console.log(`already tweeted latest patch (${latest}). skip.`);
    return;
  }

  const text = buildTweet(patch, latest);
  console.log('--- tweet ---\n' + text + '\n-------------');

  const keys = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('ERROR: 認証情報が未設定です → ' + missing.join(', '));
    console.error('GitHub の Secrets に4つのキーを登録してください。');
    process.exit(1);
  }

  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });

  const res = await client.v2.tweet(text);
  console.log('posted tweet id:', res.data.id);

  fs.writeFileSync(STATE_FILE, latest + '\n', 'utf8');
  console.log('state updated:', latest);
}

main().catch(err => { console.error(err); process.exit(1); });
