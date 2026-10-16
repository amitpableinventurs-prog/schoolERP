import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat, betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { config } from './config.js'
import { Batch, Exam, FeeInstallment, Lead, Mark, Student, TimetableSlot } from './models.js'
import { atRiskStudents, attendanceSummary, dashboardStats, feeSummaryByStudent, getSettings, installmentStatus, scoreLead } from './insights.js'
import { escapeRegex, httpError, ymd } from './util.js'
import { createCompatClient } from './llm.js'

// One provider at a time (AI_PROVIDER in .env): Claude through the Anthropic SDK,
// OpenAI and Gemini through their OpenAI-compatible Chat Completions API.
export const aiEnabled = config.ai.enabled
export const aiProvider = config.ai.provider
const MODEL = config.ai.model
const client = aiEnabled && aiProvider === 'anthropic' ? new Anthropic() : null
const compat = aiEnabled && aiProvider !== 'anthropic' ? createCompatClient({ provider: aiProvider, apiKey: config.ai.apiKey, model: MODEL, fallbackModel: config.ai.fallbackModel }) : null

// If the model declines a request, the API retries it on a fallback model chosen
// by refusal category. Set AI_FALLBACKS=off in .env to disable.
const FALLBACK = process.env.AI_FALLBACKS === 'off' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }

function ensureAI() {
  if (!aiEnabled) throw httpError(503, `AI is not configured yet. Add ${config.ai.keyVar} to the .env file and restart the server.`)
}

function textOf(message) {
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
}

function assertNotRefused(message) {
  if (message.stop_reason === 'refusal') {
    throw httpError(422, 'The AI could not help with this request. Please rephrase it.')
  }
}

// Turns SDK errors into messages the staff can act on.
async function callAI(fn) {
  ensureAI()
  try {
    return await fn()
  } catch (error) {
    if (error.status && !(error instanceof Anthropic.APIError)) throw error
    if (error instanceof Anthropic.AuthenticationError) throw httpError(503, 'The ANTHROPIC_API_KEY is invalid. Check .env (a system-wide ANTHROPIC_API_KEY variable takes priority over .env).')
    if (error instanceof Anthropic.PermissionDeniedError) throw httpError(503, 'This API key is not allowed to use the configured AI model.')
    if (error instanceof Anthropic.RateLimitError) throw httpError(429, 'AI is busy right now (rate limit). Please try again in a minute.')
    if (error instanceof Anthropic.BadRequestError) {
      console.error('[ai] bad request:', error.message)
      throw httpError(502, 'The AI request was rejected. Check the server log for details.')
    }
    if (error instanceof Anthropic.APIConnectionError) throw httpError(502, 'Could not reach the AI service. Check the internet connection.')
    if (error instanceof Anthropic.APIError) {
      console.error('[ai] API error:', error.status, error.message)
      throw httpError(502, 'The AI service had a problem. Please try again.')
    }
    throw error
  }
}

async function structured(schema, { system, prompt, effort = 'medium' }) {
  ensureAI()
  if (compat) return compat.structured(schema, { system, prompt })
  return callAI(async () => {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    assertNotRefused(response)
    if (!response.parsed_output) throw httpError(502, 'The AI returned an incomplete answer. Please try again.')
    return response.parsed_output
  })
}

async function plainText({ system, prompt, effort = 'low' }) {
  ensureAI()
  if (compat) return compat.plainText({ system, prompt })
  return callAI(async () => {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort },
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    assertNotRefused(response)
    return textOf(response)
  })
}

const json = (value) => JSON.stringify(value)

/* ───────────────────────── Assistant tools (read-only) ───────────────────────── */

// Tools are built per request with the user's wing scope (see scope.js). Each is
// { name, description, inputSchema (zod), run }; wrapped with betaZodTool for Claude.
const tool = (definition) => definition

function makeAssistantTools(scope) {
  const all = scope.all
  const inBatches = all ? {} : { batch: { $in: scope.batchIds } }
  const findBatchId = async (name) => {
    if (!name) return undefined
    const batch = await Batch.findOne({ name: new RegExp(escapeRegex(name), 'i'), ...(all ? {} : { type: { $in: scope.wings } }) }).lean()
    return batch?._id
  }
  const batchOr = async (name) => {
    const id = await findBatchId(name)
    return id ? { batch: id } : inBatches
  }

  return [
    tool({
      name: 'get_overview',
      description: 'Institute-wide numbers: active students by type (school/college/coaching), staff, today\'s attendance, fee collection this month, outstanding and overdue fees, lead pipeline and 6-month collection trend.',
      inputSchema: z.object({}),
      run: async () => json(await dashboardStats(scope)),
    }),
    tool({
      name: 'list_batches',
      description: 'All classes, college courses and coaching batches with type, subjects, timing, fee and student count.',
      inputSchema: z.object({}),
      run: async () => {
        const [batches, counts] = await Promise.all([
          Batch.find(all ? {} : { type: { $in: scope.wings } }).populate('classTeacher', 'name').lean(),
          Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$batch', n: { $sum: 1 } } }]),
        ])
        const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]))
        return json(batches.map((b) => ({ id: b._id, name: b.name, type: b.type, program: b.program, subjects: b.subjects, timing: b.timing, fee: b.fee, classTeacher: b.classTeacher?.name, students: countMap[String(b._id)] || 0, status: b.status })))
      },
    }),
    tool({
      name: 'search_students',
      description: 'Find students by name, admission number or phone, optionally within a batch (partial batch name allowed). Returns at most 25.',
      inputSchema: z.object({
        query: z.string().optional().describe('Name, admission number or phone fragment'),
        batch_name: z.string().optional(),
      }),
      run: async ({ query, batch_name }) => {
        const filter = await batchOr(batch_name)
        if (query) {
          const rx = new RegExp(escapeRegex(query), 'i')
          filter.$or = [{ name: rx }, { admissionNo: rx }, { phone: rx }, { guardianPhone: rx }]
        }
        const list = await Student.find(filter).limit(25).populate('batch', 'name type').lean()
        return json(list.map((s) => ({ id: s._id, admissionNo: s.admissionNo, name: s.name, batch: s.batch?.name, type: s.batch?.type, guardian: s.guardianName, guardianPhone: s.guardianPhone, status: s.status })))
      },
    }),
    tool({
      name: 'get_student_report',
      description: 'Full report for one student: profile, 30-day attendance, fee balance/overdue, and every exam result.',
      inputSchema: z.object({ admission_no_or_id: z.string() }),
      run: async ({ admission_no_or_id: key }) => {
        const student = /^[a-f0-9]{24}$/i.test(key)
          ? await Student.findOne({ _id: key, ...inBatches }).populate('batch', 'name type').lean()
          : await Student.findOne({ admissionNo: new RegExp(`^${escapeRegex(key)}$`, 'i'), ...inBatches }).populate('batch', 'name type').lean()
        if (!student) return 'No student found with that admission number.'
        const ids = [student._id]
        const [att, fees, marks] = await Promise.all([
          attendanceSummary({ studentIds: ids }),
          feeSummaryByStudent(ids),
          Mark.find({ student: student._id }).populate('exam', 'name date').lean(),
        ])
        return json({
          student: { name: student.name, admissionNo: student.admissionNo, batch: student.batch?.name, type: student.batch?.type, guardian: student.guardianName, guardianPhone: student.guardianPhone, status: student.status },
          attendanceLast30Days: att.get(String(student._id)) || null,
          fees: fees.get(String(student._id)) || null,
          exams: marks.map((m) => ({ exam: m.exam?.name, date: m.exam?.date, percent: m.percent, grade: m.grade, rank: m.rank, scores: m.scores })),
        })
      },
    }),
    tool({
      name: 'get_fee_dues',
      description: 'Unpaid fee installments (balance > 0), optionally overdue only and/or for one batch. Returns at most 60 rows, biggest balance first, plus totals.',
      inputSchema: z.object({ only_overdue: z.boolean().optional(), batch_name: z.string().optional() }),
      run: async ({ only_overdue, batch_name }) => {
        const filter = await batchOr(batch_name)
        const list = await FeeInstallment.find(filter).populate({ path: 'student', select: 'name admissionNo guardianPhone batch', populate: { path: 'batch', select: 'name' } }).lean()
        const today = ymd()
        const rows = list
          .map((i) => ({ ...installmentStatus(i, today), i }))
          .filter((r) => r.balance > 0 && (!only_overdue || r.status === 'overdue'))
          .sort((a, b) => b.balance - a.balance)
        return json({
          count: rows.length,
          totalBalance: rows.reduce((s, r) => s + r.balance, 0),
          rows: rows.slice(0, 60).map((r) => ({ student: r.i.student?.name, admissionNo: r.i.student?.admissionNo, batch: r.i.student?.batch?.name, guardianPhone: r.i.student?.guardianPhone, installment: r.i.title, dueDate: r.i.dueDate, balance: r.balance, status: r.status, daysOverdue: r.daysOverdue })),
        })
      },
    }),
    tool({
      name: 'get_attendance_report',
      description: 'Attendance percentage per batch over the last N days and the students below the institute threshold.',
      inputSchema: z.object({ days: z.number().int().optional().describe('Default 30'), batch_name: z.string().optional() }),
      run: async ({ days = 30, batch_name }) => {
        const settings = await getSettings()
        const batchId = await findBatchId(batch_name)
        const students = await Student.find({ status: 'active', ...(batchId ? { batch: batchId } : inBatches) }).populate('batch', 'name').lean()
        const att = await attendanceSummary({ studentIds: students.map((s) => s._id), days })
        const perBatch = {}
        const low = []
        for (const s of students) {
          const a = att.get(String(s._id))
          if (!a) continue
          const b = (perBatch[s.batch?.name] ||= { present: 0, total: 0 })
          b.present += a.present
          b.total += a.total
          if (a.pct < settings.attendanceThreshold) low.push({ name: s.name, admissionNo: s.admissionNo, batch: s.batch?.name, pct: a.pct })
        }
        return json({
          days,
          threshold: settings.attendanceThreshold,
          batches: Object.entries(perBatch).map(([name, v]) => ({ batch: name, pct: Math.round((v.present / v.total) * 100) })),
          belowThreshold: low.sort((a, b) => a.pct - b.pct).slice(0, 40),
        })
      },
    }),
    tool({
      name: 'get_at_risk_students',
      description: 'Early-warning list: students with a risk score from low attendance, falling/low marks and overdue fees, with the reasons.',
      inputSchema: z.object({ batch_name: z.string().optional() }),
      run: async ({ batch_name }) => json(await atRiskStudents({ batchId: await findBatchId(batch_name), limit: 30, scope })),
    }),
    tool({
      name: 'get_leads',
      description: 'Admission enquiries (CRM) with status, conversion score and next follow-up date. Filter by status or "due" for follow-ups due today or earlier.',
      inputSchema: z.object({ filter: z.enum(['all', 'due', 'new', 'contacted', 'demo', 'visited', 'converted', 'lost']).optional() }),
      run: async ({ filter = 'all' }) => {
        const q = filter === 'all' ? {} : filter === 'due' ? { status: { $nin: ['converted', 'lost'] }, nextFollowUp: { $lte: ymd() } } : { status: filter }
        if (!all) q.type = { $in: scope.wings }
        const leads = await Lead.find(q).sort({ updatedAt: -1 }).limit(50).lean()
        return json(leads.map((l) => ({ name: l.name, phone: l.phone, course: l.course, source: l.source, status: l.status, score: scoreLead(l), nextFollowUp: l.nextFollowUp, followUps: l.followUps?.length || 0, lastNote: l.followUps?.at(-1)?.note })))
      },
    }),
    tool({
      name: 'get_exam_results',
      description: 'Latest exams with class average, pass count and top 5 students. Optionally for one batch.',
      inputSchema: z.object({ batch_name: z.string().optional() }),
      run: async ({ batch_name }) => {
        const settings = await getSettings()
        const batchId = await findBatchId(batch_name)
        const exams = await Exam.find(batchId ? { batch: batchId } : inBatches).sort({ date: -1 }).limit(8).populate('batch', 'name').lean()
        const out = []
        for (const exam of exams) {
          const marks = await Mark.find({ exam: exam._id }).populate('student', 'name admissionNo').sort({ percent: -1 }).lean()
          if (!marks.length) continue
          out.push({
            exam: exam.name, batch: exam.batch?.name, date: exam.date,
            average: Math.round(marks.reduce((s, m) => s + (m.percent || 0), 0) / marks.length),
            passed: marks.filter((m) => m.percent >= settings.passPercent).length,
            students: marks.length,
            top5: marks.slice(0, 5).map((m) => ({ name: m.student?.name, percent: m.percent, grade: m.grade })),
          })
        }
        return json(out)
      },
    }),
    tool({
      name: 'get_timetable',
      description: 'Weekly timetable for a batch (day 1 = Monday).',
      inputSchema: z.object({ batch_name: z.string() }),
      run: async ({ batch_name }) => {
        const batchId = await findBatchId(batch_name)
        if (!batchId) return 'Batch not found.'
        const slots = await TimetableSlot.find({ batch: batchId }).populate('teacher', 'name').sort({ day: 1, start: 1 }).lean()
        return json(slots.map((s) => ({ day: s.day, start: s.start, end: s.end, subject: s.subject, teacher: s.teacher?.name, room: s.room })))
      },
    }),
  ]
}

export async function assistantChat(history, user, scope = { all: true }) {
  const settings = await getSettings()
  const system = `You are the AI assistant inside the ERP of "${settings.instituteName}", an institute that runs a school, a college and coaching batches together. You help ${user.role} staff with students, attendance, fees, exams, online tests, admissions (leads) and day-to-day work.

- Always use the tools to look up facts; never invent names or numbers. If the data isn't there, say so.
- Reply in the language the user writes in (English, Hindi or Hinglish).
- Keep answers short and practical: small markdown tables or bullet lists, amounts in ₹ with Indian digit grouping.
- When asked to draft a message for parents/students (WhatsApp/SMS), keep it polite, under 60 words, and sign it with the institute name.
- ${scope.all ? 'You can see the whole institute.' : `This user only manages the ${scope.wings.join(' and ')} wing; the tools only return that data, so do not claim institute-wide numbers.`}
- You can only read data. If the user wants something changed, tell them which screen to use (Students, Fees, Attendance, Leads, Exams, Automation).
Today's date is ${ymd()}.`

  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
  if (!messages.length || messages[0].role !== 'user') throw httpError(400, 'Please type a question.')

  ensureAI()
  const tools = makeAssistantTools(scope)
  if (compat) return (await compat.runTools({ system, messages, tools, maxIterations: 8 })) || 'I could not find an answer. Please try rephrasing.'
  return callAI(async () => {
    const final = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 8,
      ...FALLBACK,
      output_config: { effort: 'medium' },
      system,
      tools: tools.map((t) => betaZodTool(t)),
      messages,
    })
    assertNotRefused(final)
    return textOf(final) || 'I could not find an answer. Please try rephrasing.'
  })
}

/* ───────────────────────── Generators ───────────────────────── */

const PaperSchema = z.object({
  title: z.string(),
  instructions: z.array(z.string()),
  sections: z.array(z.object({
    name: z.string().describe('e.g. "Section A - Multiple Choice"'),
    marksEach: z.number(),
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()).describe('Four options for MCQ, empty array otherwise'),
      answer: z.string().describe('Correct option / model answer / key points'),
    })),
  })),
})

export async function generatePaper({ subject, level, topics, mcq = 10, short = 5, long = 3, difficulty = 'medium', language = 'English', totalMarks }) {
  const prompt = `Create a question paper.
Subject: ${subject}
Class / course / exam level: ${level}
Topics / syllabus: ${topics || 'full syllabus appropriate for the level'}
Difficulty: ${difficulty}
Language: ${language}
Sections: ${mcq} multiple-choice questions (4 options each), ${short} short-answer questions, ${long} long-answer questions. Skip any section whose count is 0.
${totalMarks ? `Total marks should add up to ${totalMarks}.` : ''}
Include an answer key (the "answer" field) for every question. Questions must be original, unambiguous and match the level (CBSE/State board style for school, university style for college, JEE/NEET/competitive style for coaching).`
  return structured(PaperSchema, {
    system: 'You are an experienced Indian teacher and paper-setter. You write accurate, syllabus-aligned question papers.',
    prompt,
    effort: 'medium',
  })
}

const McqSchema = z.object({
  questions: z.array(z.object({
    q: z.string(),
    options: z.array(z.string()).describe('Exactly four options'),
    answer: z.number().int().describe('Index (0-3) of the correct option'),
    explanation: z.string().describe('One or two lines explaining the answer'),
  })),
})

export async function generateMcqs({ subject, level, topic, count = 10, difficulty = 'medium', language = 'English' }) {
  const out = await structured(McqSchema, {
    system: 'You are an expert coaching-institute faculty member who writes high-quality MCQs for online tests.',
    prompt: `Write ${count} multiple-choice questions.
Subject: ${subject}
Level: ${level}
Topic: ${topic}
Difficulty: ${difficulty}
Language: ${language}
Each question has exactly four options and exactly one correct answer. Vary which option is correct. Double-check every answer.`,
    effort: 'medium',
  })
  // Keep only well-formed questions.
  return out.questions.filter((q) => q.options?.length === 4 && q.answer >= 0 && q.answer < 4)
}

const RemarksSchema = z.object({
  remarks: z.array(z.object({ admissionNo: z.string(), remark: z.string() })),
})

export async function generateRemarks({ examName, batchName, rows }) {
  const out = await structured(RemarksSchema, {
    system: 'You are a caring class teacher writing report-card remarks. Each remark is 1-2 sentences (max 30 words), specific to the student\'s subject scores and attendance, encouraging, and mentions one concrete area to improve when needed. No names in the remark.',
    prompt: `Exam: ${examName} — ${batchName}\nWrite one remark per student (use the admissionNo exactly as given).\n\n${JSON.stringify(rows)}`,
    effort: 'low',
  })
  return out.remarks
}

export async function answerDoubt({ question, subject, level }) {
  return plainText({
    system: `You are a patient tutor for a ${level || 'school/college/coaching'} student in India. Explain step by step in simple words, using the same language as the question (English, Hindi or Hinglish). Use short paragraphs, numbered steps and plain-text formulas. End with one quick practice question.`,
    prompt: `${subject ? `Subject: ${subject}\n` : ''}Doubt: ${question}`,
    effort: 'low',
  })
}

export async function riskActionPlan(entry) {
  return plainText({
    system: 'You are an academic counsellor at an Indian institute. Write a short, practical intervention plan.',
    prompt: `Student risk data:\n${JSON.stringify(entry)}\n\nWrite: 1) a two-line summary of the problem, 2) three concrete actions for the teacher/counsellor this week, 3) a polite WhatsApp message (max 60 words) to the parent in Hinglish.`,
    effort: 'low',
  })
}

const LeadMessageSchema = z.object({ message: z.string(), tip: z.string().describe('One-line advice for the counsellor') })

export async function leadMessage(lead, instituteName, language = 'Hinglish') {
  return structured(LeadMessageSchema, {
    system: 'You are an admissions counsellor writing WhatsApp follow-ups for an Indian education institute. Friendly, short (max 60 words), no pressure tactics, one clear next step (visit, free demo class, call back).',
    prompt: `Institute: ${instituteName}\nLanguage: ${language}\nLead: ${JSON.stringify({ name: lead.name, course: lead.course, source: lead.source, status: lead.status, notes: lead.notes, history: lead.followUps?.map((f) => f.note) })}`,
    effort: 'low',
  })
}

const NoticeSchema = z.object({ title: z.string(), body: z.string() })

export async function draftNotice({ points, audience, language = 'English' }, instituteName) {
  return structured(NoticeSchema, {
    system: 'You write clear, polite official notices for an Indian school/college/coaching institute.',
    prompt: `Institute: ${instituteName}\nAudience: ${audience}\nLanguage: ${language}\nWrite a notice from these points:\n${points}`,
    effort: 'low',
  })
}
