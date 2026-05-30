import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import type { TranslationAPI } from '../types/project'
import { SUPPORTED_LOCALES } from '../constants/defaults'
import { isTauri } from './tauri'

// In the Tauri shell, route LLM calls through the Rust http plugin: it bypasses
// CORS and makes `anthropic-dangerous-direct-browser-access` moot. The web
// build falls back to the browser fetch (which still needs that header).
const http: typeof fetch = isTauri() ? tauriFetch : fetch.bind(globalThis)

const LOCALE_NAME = Object.fromEntries(SUPPORTED_LOCALES.map(l => [l.code, l.label]))

function buildPrompt(texts: string[], src: string, tgt: string): string {
  const srcName = LOCALE_NAME[src] ?? src
  const tgtName = LOCALE_NAME[tgt] ?? tgt
  return `You are a native ${tgtName} app-marketing copywriter. Rewrite these App Store screenshot captions from ${srcName} into ${tgtName} (${tgt}).

Make them sound natural and idiomatic — how a native speaker would actually say it, never a literal translation. Keep them short and punchy: same length as the source or shorter, never more wordy. Use the correct regional variant for ${tgt}. Preserve line breaks; keep brand/product names, numbers, %, and emoji unchanged.

Return ONLY a JSON array of exactly ${texts.length} strings in the same order, nothing else.

Input: ${JSON.stringify(texts)}`
}

function parseJsonArray(text: string, n: number): string[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('응답에서 JSON 배열을 찾을 수 없습니다')
  const arr: unknown = JSON.parse(match[0])
  if (!Array.isArray(arr) || arr.length === 0)
    throw new Error('응답에서 번역 결과를 찾을 수 없습니다')
  // Tolerate count drift: models occasionally drop, merge, or add an item.
  // Align to n (truncate extras, pad shortfalls with '') so a near-miss yields
  // a usable partial result the user can finish — better than discarding the
  // whole locale and re-spending on a retry.
  const out = arr.slice(0, n).map(String)
  while (out.length < n) out.push('')
  return out
}

async function viaClaude(texts: string[], src: string, tgt: string, key: string): Promise<string[]> {
  const res = await http('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(texts, src, tgt) }],
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `Claude API ${res.status}`)
  }
  const data = (await res.json()) as { content: Array<{ text: string }> }
  return parseJsonArray(data.content?.[0]?.text ?? '', texts.length)
}

async function viaOpenAI(texts: string[], src: string, tgt: string, key: string): Promise<string[]> {
  const res = await http('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: buildPrompt(texts, src, tgt) }],
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `OpenAI API ${res.status}`)
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
  return parseJsonArray(data.choices?.[0]?.message?.content ?? '', texts.length)
}

async function viaGemini(texts: string[], src: string, tgt: string, key: string): Promise<string[]> {
  const res = await http(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    {
      method: 'POST',
      // Key goes in a header, not the URL query string — a query-string key
      // leaks into browser history, referrers, and proxy logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(texts, src, tgt) }] }],
      }),
    },
  )
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `Gemini API ${res.status}`)
  }
  const data = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  return parseJsonArray(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', texts.length)
}

export async function translateBatch(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  api: TranslationAPI,
  apiKey: string,
): Promise<string[]> {
  if (texts.length === 0) return []
  switch (api) {
    case 'claude': return viaClaude(texts, sourceLang, targetLang, apiKey)
    case 'openai': return viaOpenAI(texts, sourceLang, targetLang, apiKey)
    case 'gemini': return viaGemini(texts, sourceLang, targetLang, apiKey)
  }
}
