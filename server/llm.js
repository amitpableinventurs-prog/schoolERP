// OpenAI-compatible chat client used for OpenAI and Google Gemini (Gemini serves
// the same Chat Completions API under /v1beta/openai). Plain fetch, no SDK.
import { z } from 'zod'
import { httpError } from './util.js'

const BASE_URL = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
}
const NAME = { openai: 'OpenAI', gemini: 'Gemini' }
const KEY_VAR = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }

// Zod → JSON Schema for response formats and tool parameters.
export function jsonSchema(schema) {
  const out = z.toJSONSchema(schema)
  delete out.$schema
  return out
}

export function createCompatClient({ provider, apiKey, model, fallbackModel }) {
  const name = NAME[provider]
  const models = [...new Set([model, fallbackModel].filter(Boolean))]

  // Overloaded / rate-limited answers are retried with a short pause, then sent to
  // the fallback model (it has its own quota), which gets two more tries.
  async function chat(body) {
    let lastError
    for (const [index, m] of models.entries()) {
      const tries = index === models.length - 1 ? 3 : 2
      for (let attempt = 0; attempt < tries; attempt++) {
        try {
          return await chatOnce(body, m)
        } catch (error) {
          if (!error.retryable) throw error
          lastError = error
          if (attempt < tries - 1) await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
        }
      }
      if (index < models.length - 1) console.warn(`[ai] ${name} ${m} busy - using ${models[index + 1]}`)
    }
    throw lastError
  }

  async function chatOnce(body, model) {
    let res
    try {
      res = await fetch(`${BASE_URL[provider]}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, ...body }),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (error) {
      if (error.name === 'TimeoutError') {
        // A stuck request is treated like an overloaded model: retry / fall back.
        console.error(`[ai] ${name} ${model} timed out`)
        const timeout = httpError(504, `${name} took too long to answer. Please try again.`)
        timeout.retryable = true
        throw timeout
      }
      throw httpError(502, `Could not reach ${name}. Check the internet connection.`)
    }
    let data = null
    try {
      data = await res.json()
    } catch {
      // Non-JSON error page.
    }
    if (Array.isArray(data)) data = data[0] // Gemini wraps errors in an array
    if (!res.ok) {
      const detail = data?.error?.message || `HTTP ${res.status}`
      console.error(`[ai] ${name} ${model} error:`, res.status, detail)
      if (res.status === 401 || res.status === 403) throw httpError(503, `The ${KEY_VAR[provider]} is invalid or not allowed to use ${model}. Check .env.`)
      if (res.status === 404) throw httpError(503, `${name} model "${model}" is not available for this key. Change the model in .env.`)
      if (res.status === 429 || res.status >= 500) {
        const error = res.status === 429
          ? httpError(429, `${name} is busy or the quota is used up. Please try again in a minute.`)
          : httpError(503, `${name} is overloaded right now. Please try again in a minute.`)
        error.retryable = true
        throw error
      }
      if (res.status === 400) throw httpError(502, 'The AI request was rejected. Check the server log for details.')
    }
    const choice = data?.choices?.[0]
    if (!choice?.message) throw httpError(502, `${name} returned an empty answer. Please try again.`)
    if (choice.finish_reason === 'content_filter') throw httpError(422, 'The AI could not help with this request. Please rephrase it.')
    return choice
  }

  async function plainText({ system, prompt }) {
    const choice = await chat({
      max_tokens: 16000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    })
    return String(choice.message.content || '').trim()
  }

  async function structured(schema, { system, prompt }) {
    const choice = await chat({
      max_tokens: 16000,
      response_format: { type: 'json_schema', json_schema: { name: 'output', schema: jsonSchema(schema) } },
      messages: [{ role: 'system', content: `${system}\n\nAnswer with JSON only, matching the given schema.` }, { role: 'user', content: prompt }],
    })
    const text = String(choice.message.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    let parsed
    try {
      parsed = schema.safeParse(JSON.parse(text))
    } catch {
      parsed = { success: false }
    }
    if (!parsed.success) {
      console.error(`[ai] ${name} returned JSON that does not match the schema:`, text.slice(0, 500))
      throw httpError(502, 'The AI returned an incomplete answer. Please try again.')
    }
    return parsed.data
  }

  // Tool-calling loop. tools: [{ name, description, inputSchema (zod), run }]
  async function runTools({ system, messages, tools, maxIterations = 8 }) {
    const defs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: jsonSchema(t.inputSchema) } }))
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    const convo = [{ role: 'system', content: system }, ...messages]
    for (let i = 0; i < maxIterations; i++) {
      const choice = await chat({ max_tokens: 16000, tools: defs, messages: convo })
      const msg = choice.message
      if (!msg.tool_calls?.length) return String(msg.content || '').trim()
      // Sent back unchanged: Gemini needs its thought signatures on the tool calls.
      convo.push(msg)
      for (const call of msg.tool_calls) {
        const tool = byName[call.function?.name]
        let content
        try {
          if (!tool) throw new Error(`Unknown tool ${call.function?.name}`)
          const args = tool.inputSchema.parse(JSON.parse(call.function.arguments || '{}'))
          content = await tool.run(args)
        } catch (error) {
          content = `Error: ${error.message}`
        }
        convo.push({ role: 'tool', tool_call_id: call.id, content: String(content) })
      }
    }
    // Out of tool rounds: ask for a final answer from what was gathered.
    const choice = await chat({ max_tokens: 16000, messages: [...convo, { role: 'user', content: 'Answer now with the information you already have.' }] })
    return String(choice.message.content || '').trim()
  }

  return { plainText, structured, runTools }
}
