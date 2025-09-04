'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchJSON } from '../utils/fetchJSON';
import { HealthRes, UppercaseRes, RandomRes } from '../type/types';

// 백엔드 API 베이스 URL: 환경변수(NEXT_PUBLIC_API_BASE) 우선, 없으면 로컬 기본값
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:50001';

export default function Home() {
  // Health
  const [health, setHealth] = useState<HealthRes | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  // Uppercase
  const [text, setText] = useState('Hello, Internship!');
  const [upper, setUpper] = useState<UppercaseRes | null>(null);
  const [upperLoading, setUpperLoading] = useState(false);
  const [upperErr, setUpperErr] = useState<string | null>(null);

  // Random
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(10);
  const [rand, setRand] = useState<RandomRes | null>(null);
  const [randLoading, setRandLoading] = useState(false);
  const [randErr, setRandErr] = useState<string | null>(null);

  const apiBaseSafe = useMemo(() => API_BASE.replace(/\/$/, ''), []);

  // 최초 진입 시 헬스 체크
  useEffect(() => {
    (async () => {
      try {
        setHealthLoading(true);
        setHealthErr(null);
        const data = await fetchJSON<HealthRes>(`${apiBaseSafe}/health`, { cache: 'no-store' });
        setHealth(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setHealthErr(msg || '헬스 체크 실패');
      } finally {
        setHealthLoading(false);
      }
    })();
  }, [apiBaseSafe]);

  const onUppercase = async () => {
    try {
      setUpperLoading(true);
      setUpperErr(null);
      const data = await fetchJSON<UppercaseRes>(`${apiBaseSafe}/uppercase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      setUpper(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUpperErr(msg || '변환 실패');
    } finally {
      setUpperLoading(false);
    }
  };

  const onRandom = async () => {
    try {
      setRandLoading(true);
      setRandErr(null);
      const params = new URLSearchParams({ min: String(min), max: String(max) });
      const data = await fetchJSON<RandomRes>(`${apiBaseSafe}/random?${params.toString()}`, { cache: 'no-store' });
      setRand(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRandErr(msg || '난수 생성 실패');
    } finally {
      setRandLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-black text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* 헤더 */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div className='w-full flex flex-col items-center'>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">❄ Chan Internship</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Gling Subdomain Infrastructure Test</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Frontend: Next.js | Backend: Express.js | Infrastructure: Docker + Nginx</p>
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Client Components</span>
            </div>
          </div>
        </header>

        {/* 카드 그리드 */}
        <main className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Health Card */}
          <section className="col-span-1 md:col-span-1 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 backdrop-blur p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">헬스 체크</h2>
            <div className="space-y-2 text-sm">
              {healthLoading ? (
                <p>확인 중…</p>
              ) : healthErr ? (
                <p className="text-rose-600">{healthErr}</p>
              ) : health ? (
                <ul className="list-inside list-disc">
                  <li>
                    status: <span className="font-mono">{health.status}</span>
                  </li>
                  <li>
                    uptime: <span className="font-mono">{health.uptime.toFixed(1)}s</span>
                  </li>
                  <li>
                    timestamp: <span className="font-mono">{new Date(health.timestamp).toLocaleString()}</span>
                  </li>
                </ul>
              ) : (
                <p>데이터 없음</p>
              )}
            </div>
            <button
              onClick={() => {
                setHealth(null);
                setHealthErr(null);
                setHealthLoading(true);
                fetchJSON<HealthRes>(`${apiBaseSafe}/health`, { cache: 'no-store' })
                  .then(setHealth)
                  .catch((e) => setHealthErr(e.message ?? '헬스 체크 실패'))
                  .finally(() => setHealthLoading(false));
              }}
              className="mt-5 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors"
            >
              다시 확인
            </button>
          </section>

          {/* Uppercase Card */}
          <section className="col-span-1 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 backdrop-blur p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">대문자 변환</h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">텍스트</span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="텍스트를 입력하세요"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400/60"
                />
              </label>
              <button
                onClick={onUppercase}
                disabled={upperLoading || !text.trim()}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors"
              >
                {upperLoading ? '변환 중…' : '변환하기'}
              </button>
              {upperErr && <p className="text-sm text-rose-600">{upperErr}</p>}
              {upper && (
                <div className="text-sm border-t border-zinc-200/70 dark:border-zinc-800 pt-3">
                  <div>
                    original: <span className="font-mono break-all">{upper.original}</span>
                  </div>
                  <div className="mt-1">
                    uppercased: <span className="font-mono break-all">{upper.uppercased}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Random Card */}
          <section className="col-span-1 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 backdrop-blur p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">난수 생성</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">min</span>
                <input
                  type="number"
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">max</span>
                <input
                  type="number"
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400/60"
                />
              </label>
            </div>
            <button
              onClick={onRandom}
              disabled={randLoading}
              className="mt-3 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors"
            >
              {randLoading ? '생성 중…' : '난수 생성'}
            </button>
            {randErr && <p className="mt-2 text-sm text-rose-600">{randErr}</p>}
            {rand && (
              <div className="mt-3 text-sm border-t border-zinc-200/70 dark:border-zinc-800 pt-3">
                <div>
                  범위: <span className="font-mono">[{rand.min}, {rand.max}]</span>
                </div>
                <div className="mt-1 text-2xl font-bold tracking-tight">
                  {rand.value}
                </div>
              </div>
            )}
          </section>
        </main>

        {/* 푸터 */}
        <footer className="mt-10 text-center text-xs text-zinc-500 dark:text-zinc-400">
          <p>
            Express API: <span className="font-mono">/health</span>, <span className="font-mono">/uppercase</span>, <span className="font-mono">/random</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
