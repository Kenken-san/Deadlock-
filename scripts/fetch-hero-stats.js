import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const STATS_URL = 'https://api.deadlock-api.com/v1/analytics/hero-stats';
const HEROES_URL = 'https://api.deadlock-api.com/v1/assets/heroes?only_active=true';
const BUCKET = 'deadlock-patch-data';
const KEY = 'hero-stats.json';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
  return res.json();
}

async function main() {
  const [statsRaw, heroesRaw] = await Promise.all([
    fetchJson(STATS_URL),
    fetchJson(HEROES_URL).catch(() => []),
  ]);

  // hero_id → 日本語名 マッピング（APIが名前を返さない場合のフォールバック）
  const nameMap = Object.fromEntries(
    heroesRaw.map(h => [h.id ?? h.hero_id, h.name])
  );

  const totalMatches = statsRaw.reduce((sum, h) => sum + (h.matches ?? 0), 0);

  const heroes = statsRaw
    .filter(h => (h.wins ?? 0) + (h.losses ?? 0) > 0)
    .map(h => {
      const played = (h.wins ?? 0) + (h.losses ?? 0);
      return {
        hero_id: h.hero_id,
        name: nameMap[h.hero_id] ?? `Hero ${h.hero_id}`,
        win_rate: played > 0 ? h.wins / played : 0,
        pick_rate: totalMatches > 0 ? h.matches / totalMatches : 0,
        matches: h.matches ?? 0,
      };
    })
    .sort((a, b) => b.win_rate - a.win_rate);

  const output = {
    updated_at: new Date().toISOString(),
    heroes,
  };

  const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: JSON.stringify(output),
    ContentType: 'application/json',
  }));

  console.log(`uploaded ${heroes.length} heroes to s3://${BUCKET}/${KEY}`);
}

main().catch(err => { console.error(err); process.exit(1); });
