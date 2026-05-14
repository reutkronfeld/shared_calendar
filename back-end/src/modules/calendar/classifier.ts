import { env } from '../../config/env.js';

export type Importance = 'critical' | 'movable' | 'unknown';

const CRITICAL_PATTERNS: RegExp[] = [
  /\bרופא\b|\bמרפא\b|\bבית[\s־-]?חולים\b|\bניתוח\b|\bתור\b/i,
  /\b(doctor|dentist|hospital|surgery|clinic|appointment|er|emergency)\b/i,
  /\bחתונה\b|\bבר[\s־-]?מצוה\b|\bבת[\s־-]?מצוה\b|\bלוויה\b|\bשבעה\b|\bברית\b|\bהלוויה\b/i,
  /\b(wedding|funeral|bris|memorial|shiva)\b/i,
  /\bבית[\s־-]?משפט\b|\bמשטרה\b|\bראיון\b/i,
  /\b(court|police|interview)\b/i,
  /\bטיסה\b|\bנמל[\s־-]?תעופה\b/i,
  /\b(flight|airport|boarding)\b/i,
  /\bמבחן\b|\bבחינה\b|\bמועד[\s־-]?א'?\b/i,
  /\b(exam|final|midterm)\b/i,
];

const MOVABLE_PATTERNS: RegExp[] = [
  /\bsync\b|\b1[:\s]?on[:\s]?1\b|\b1:1\b|\bstandup\b|\bdaily\b|\bweekly\b|\bcatch[\s-]?up\b/i,
  /\bפגישה\b|\bשיחה\b|\bדיון\b|\bהתנעה\b|\bסקירה\b/i,
  /\b(meeting|call|review|chat|coffee|lunch|brainstorm)\b/i,
];

function heuristicClassify(summary: string): Importance {
  const s = summary.trim();
  if (!s) return 'unknown';
  for (const p of CRITICAL_PATTERNS) if (p.test(s)) return 'critical';
  for (const p of MOVABLE_PATTERNS) if (p.test(s)) return 'movable';
  return 'unknown';
}

const cache = new Map<string, Importance>();
const CACHE_MAX = 500;
function cacheGet(key: string): Importance | undefined {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}
function cacheSet(key: string, v: Importance): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, v);
}

interface OpenRouterResp {
  choices?: Array<{ message?: { content?: string } }>;
}

async function llmClassifyBatch(summaries: string[]): Promise<Importance[]> {
  if (!env.OPENROUTER_API_KEY || summaries.length === 0) {
    return summaries.map(() => 'unknown' as Importance);
  }
  const numbered = summaries.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const body = {
    model: 'openai/gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You classify calendar event titles by how movable they are. Reply with exactly N lines, one per event, in order. Each line: just "critical" or "movable".\n' +
          '- "critical": cannot be moved (doctor, hospital, wedding, funeral, flight, court, exam, parent-teacher meeting).\n' +
          '- "movable": flexible (work meetings, syncs, 1:1, lunch, brainstorm, coffee, catch-up).\n' +
          'When in doubt, choose "movable". Output only the labels, no numbering, no extra text.',
      },
      { role: 'user', content: numbered },
    ],
    temperature: 0,
    max_tokens: 200,
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return summaries.map(() => 'unknown' as Importance);
  }
  const json = (await res.json()) as OpenRouterResp;
  const text = json.choices?.[0]?.message?.content ?? '';
  const lines = text
    .split('\n')
    .map((l) => l.trim().toLowerCase().replace(/^[\d.\-)\s]+/, ''))
    .filter(Boolean);

  return summaries.map((_, i) => {
    const v = lines[i];
    if (v === 'critical') return 'critical';
    if (v === 'movable') return 'movable';
    return 'movable';
  });
}

export async function classifyEvents(summaries: string[]): Promise<Importance[]> {
  const out: Importance[] = new Array(summaries.length).fill('unknown');
  const needLLM: Array<{ idx: number; summary: string }> = [];

  for (let i = 0; i < summaries.length; i += 1) {
    const s = summaries[i] ?? '';
    if (!s.trim()) {
      out[i] = 'movable';
      continue;
    }
    const cached = cacheGet(s);
    if (cached) {
      out[i] = cached;
      continue;
    }
    const h = heuristicClassify(s);
    if (h !== 'unknown') {
      out[i] = h;
      cacheSet(s, h);
      continue;
    }
    needLLM.push({ idx: i, summary: s });
  }

  if (needLLM.length > 0) {
    const llmOut = await llmClassifyBatch(needLLM.map((x) => x.summary));
    for (let j = 0; j < needLLM.length; j += 1) {
      const importance = llmOut[j] ?? 'movable';
      out[needLLM[j]!.idx] = importance;
      cacheSet(needLLM[j]!.summary, importance);
    }
  }

  return out;
}
