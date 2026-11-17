import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = 'ma-cook';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'profile-assets-generator',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const languageColors = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  CSS: '#563d7c',
  HTML: '#e34c26',
  Rust: '#dea584',
  Shell: '#89e051',
  PowerShell: '#5391fe',
  PLpgSQL: '#336790',
  GLSL: '#5686a5',
  HCL: '#844FBA',
  Dockerfile: '#384d54',
  Python: '#3572A5',
  PHP: '#4F5D95',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Go: '#00ADD8',
  Ruby: '#701516',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Lua: '#000080',
  Markdown: '#083fa1',
  JSON: '#292929',
  YAML: '#cb171e',
  Vue: '#41b883',
  SCSS: '#c6538c',
  Sass: '#a53b70',
  Dart: '#00B4AB',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Scala: '#c22d40',
  R: '#198CE7',
  VimScript: '#199f4b',
  Batchfile: '#C1F12E',
  Makefile: '#427819',
  TeX: '#3D6117',
  JupyterNotebook: '#DA5B0B',
};

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[char]);
}

async function api(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API ${pathname} failed: ${response.status} ${detail.slice(0, 200)}`);
  }
  return response.json();
}

async function apiAll(pathname) {
  const results = [];
  for (let page = 1; ; page += 1) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await api(`${pathname}${separator}per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

async function mapWithLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output;
}

function buildSkillsSvg(languages, repositoryCount, generatedAt) {
  const pills = [];
  let x = 40;
  let y = 104;

  for (const language of languages) {
    const percent = `${(language.share * 100).toFixed(1)}%`;
    const width = Math.max(168, 58 + language.name.length * 10 + percent.length * 10);
    if (x + width > 1160) {
      x = 40;
      y += 54;
    }
    const color = language.color;
    pills.push(
      `    <rect x="${x}" y="${y}" width="${width}" height="38" rx="19" fill="#161b22" stroke="${color}" stroke-opacity="0.55"/>`,
      `    <circle cx="${x + 21}" cy="${y + 19}" r="6" fill="${color}"/>`,
      `    <text x="${x + 36}" y="${y + 25}" font-size="15" font-weight="600" fill="#e6edf3">${escapeXml(language.name)}</text>`,
      `    <text x="${x + width - 14}" y="${y + 25}" font-size="14" font-weight="600" text-anchor="end" fill="${color}">${percent}</text>`,
    );
    x += width + 12;
  }

  const height = y + 74;
  const date = generatedAt.slice(0, 10);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 ${height}" width="1200" height="${height}" role="img" aria-label="Languages used across public repositories">`,
    '  <style>',
    '    text { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; }',
    '  </style>',
    '  <rect width="1200" height="' + height + '" rx="14" fill="#0d1117"/>',
    '  <rect x="0.5" y="0.5" width="1199" height="' + (height - 1) + '" rx="14" fill="none" stroke="#30363d"/>',
    '  <text x="40" y="50" font-size="26" font-weight="700" fill="#e6edf3" letter-spacing="1">LANGUAGES IN PUBLIC REPOS</text>',
    `  <text x="40" y="76" font-size="14" fill="#8b949e">${repositoryCount} original repositories · ranked by bytes · updated ${date}</text>`,
    ...pills,
    '</svg>',
    '',
  ].join('\n');
}

function frameValues(target, steps) {
  if (target <= steps) return Array.from({ length: target + 1 }, (_, index) => index);
  const values = Array.from({ length: steps }, (_, index) => Math.round((target * index) / (steps - 1)));
  values[values.length - 1] = target;
  return [...new Set(values)];
}

function percent(value) {
  return `${value.toFixed(2)}%`;
}

function buildStatStyles(counters) {
  const lines = [
    '  <style id="stat-styles">',
    '    .stat-label { fill: #9aa4ad; font-size: 16px; font-weight: 600; letter-spacing: 3px; }',
    '    .stat-value { fill: #36dd52; font-size: 44px; font-weight: 700; filter: url(#textGlow); opacity: 0; animation-duration: 1.6s; animation-timing-function: step-end; animation-fill-mode: forwards; }',
  ];

  for (const counter of counters) {
    const slot = 100 / counter.values.length;
    counter.values.forEach((_, index) => {
      const start = index * slot;
      const end = (index + 1) * slot;
      lines.push(`    .stat-${counter.key}-${index} { animation-name: sf-${counter.key}-${index}; }`);
      if (index === 0) {
        lines.push(`    @keyframes sf-${counter.key}-0 { 0%, ${percent(end - 0.01)} { opacity: 1; } ${percent(end)}, 100% { opacity: 0; } }`);
      } else if (index === counter.values.length - 1) {
        lines.push(`    @keyframes sf-${counter.key}-${index} { 0%, ${percent(start - 0.01)} { opacity: 0; } ${percent(start)}, 100% { opacity: 1; } }`);
      } else {
        lines.push(`    @keyframes sf-${counter.key}-${index} { 0%, ${percent(start - 0.01)} { opacity: 0; } ${percent(start)}, ${percent(end - 0.01)} { opacity: 1; } ${percent(end)}, 100% { opacity: 0; } }`);
      }
    });
  }

  lines.push('  </style>');
  return lines.join('\n');
}

function buildStatFrames(counter, x) {
  return [
    `      <g>`,
    ...counter.values.map((value, index) =>
      `        <text class="stat-value stat-${counter.key}-${index}" x="${x}" y="668">${escapeXml(counter.format(value))}</text>`),
    '      </g>',
  ].join('\n');
}

function buildStatsGroup(counters) {
  return [
    '  <g id="profile-stats" aria-label="Live GitHub statistics">',
    '    <rect x="140" y="580" width="920" height="100" rx="16" fill="#050505" fill-opacity="0.82" stroke="#36dd52" stroke-opacity="0.25"/>',
    '    <line x1="450" y1="602" x2="450" y2="658" stroke="#36dd52" stroke-opacity="0.18"/>',
    '    <line x1="750" y1="602" x2="750" y2="658" stroke="#36dd52" stroke-opacity="0.18"/>',
    '    <g text-anchor="middle" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif">',
    `      <text class="stat-label" x="295" y="618">${counters[0].label}</text>`,
    buildStatFrames(counters[0], 295),
    `      <text class="stat-label" x="600" y="618">${counters[1].label}</text>`,
    buildStatFrames(counters[1], 600),
    `      <text class="stat-label" x="905" y="618">${counters[2].label}</text>`,
    buildStatFrames(counters[2], 905),
    '    </g>',
    '  </g>',
  ].join('\n');
}

function updateIntro(years, commits, stars) {
  const introPath = path.join(root, 'intro.svg');
  let svg = readFileSync(introPath, 'utf8');
  svg = svg.replace(/\n  <style id="stat-styles">[\s\S]*?<\/style>/g, '');
  svg = svg.replace(/\n  <g id="profile-stats"[\s\S]*?\n  <\/g>/g, '');

  const counters = [
    { key: 'y', label: 'YEARS ON GITHUB', values: frameValues(years, 7), format: (value) => String(value) },
    { key: 'c', label: 'COMMITS', values: frameValues(commits, 16), format: (value) => value.toLocaleString('en-US') },
    { key: 's', label: 'REPO STARS', values: frameValues(stars, 11), format: (value) => value.toLocaleString('en-US') },
  ];

  const addition = `${buildStatStyles(counters)}\n${buildStatsGroup(counters)}`;
  svg = svg.replace(/\n<\/svg>\s*$/, `\n${addition}\n</svg>\n`);
  writeFileSync(introPath, svg, 'utf8');
}

async function main() {
  const [user, repos, commitSearch] = await Promise.all([
    api(`/users/${owner}`),
    apiAll(`/users/${owner}/repos?type=owner&sort=updated`),
    api('/search/commits?q=author%3A' + owner + '&per_page=1'),
  ]);

  const originalRepos = repos.filter((repo) => !repo.fork);
  const languageTotals = new Map();
  const languageResults = await mapWithLimit(originalRepos, 6, async (repo) => {
    try {
      return await api(`/repos/${owner}/${repo.name}/languages`);
    } catch {
      return {};
    }
  });

  for (const languages of languageResults) {
    for (const [name, bytes] of Object.entries(languages)) {
      languageTotals.set(name, (languageTotals.get(name) || 0) + bytes);
    }
  }

  const totalBytes = [...languageTotals.values()].reduce((sum, bytes) => sum + bytes, 0);
  const languages = [...languageTotals.entries()]
    .map(([name, bytes]) => ({
      name,
      bytes,
      share: totalBytes ? bytes / totalBytes : 0,
      color: languageColors[name] || '#8b949e',
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const stars = originalRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const years = Math.max(0, Math.floor((Date.now() - Date.parse(user.created_at)) / (365.2425 * 24 * 60 * 60 * 1000)));
  const commits = commitSearch.total_count;
  const generatedAt = new Date().toISOString();

  const skillsDir = path.join(root, 'assets', 'skills');
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(path.join(skillsDir, 'skills.json'), `${JSON.stringify({
    generatedAt,
    username: owner,
    repositoryCount: originalRepos.length,
    forksExcluded: true,
    totals: { years, commits, stars },
    languages,
  }, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(skillsDir, 'skills.svg'), buildSkillsSvg(languages, originalRepos.length, generatedAt), 'utf8');
  updateIntro(years, commits, stars);

  process.stdout.write(`years=${years} commits=${commits} stars=${stars} languages=${languages.length} repos=${originalRepos.length}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
