// Demo LMS content: courses with progress, assignments with submissions, leave
// applications. Looks batches and students up by name, so it also works on a
// database that was seeded before the LMS existed.
import { Assignment, Batch, Course, CourseProgress, LeaveRequest, Student, Submission, User } from './models.js'
import { applyLeaveToAttendance, lessonIds } from './services.js'
import { addDays, ymd } from './util.js'

let seedState = 7
const rand = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296)

const mcq = (q, options, answer, explanation, marks = 1) => ({ q, options, answer, explanation, marks })

const PHYSICS = {
  title: 'Physics: Laws of Motion',
  subject: 'Physics',
  description: 'Newton\'s laws, free-body diagrams, friction and circular motion — with short quizzes after each module.',
  modules: [
    {
      title: 'Newton\'s laws of motion',
      lessons: [
        { title: 'Introduction to Newton\'s laws', kind: 'video', url: 'https://www.youtube.com/results?search_query=newton+laws+of+motion+jee', durationMin: 25, content: 'Watch the lecture, then read the notes on free-body diagrams.' },
        {
          title: 'Notes: Free-body diagrams', kind: 'reading', durationMin: 10,
          content: '## Steps to draw a free-body diagram\n\n1. Isolate the body you are studying.\n2. Draw **every force** acting on it: weight (mg), normal reaction (N), tension (T), friction (f), applied forces.\n3. Choose axes — usually along and perpendicular to the surface.\n4. Apply **ΣF = ma** along each axis.\n\n## Common mistakes\n\n- Adding forces the body exerts on others (those act on the *other* body).\n- Forgetting the pseudo force in an accelerating frame: **−ma₀**.\n- Mixing up mass and weight.',
        },
        {
          title: 'Quick check: Newton\'s laws', kind: 'quiz', durationMin: 5,
          questions: [
            mcq('The SI unit of impulse is:', ['N/s', 'N·s', 'kg·m/s²', 'J/s'], 1, 'Impulse = Force × time, so N·s.'),
            mcq('Which law gives F = ma?', ['First law', 'Second law', 'Third law', 'Law of gravitation'], 1, 'The second law: net force = rate of change of momentum.'),
            mcq('Action and reaction forces act on:', ['The same body', 'Different bodies', 'Only moving bodies', 'Only bodies at rest'], 1, 'Third-law pairs always act on two different bodies.'),
          ],
        },
      ],
    },
    {
      title: 'Friction and circular motion',
      lessons: [
        {
          title: 'Friction: key formulas', kind: 'reading', durationMin: 8,
          content: '## Static and kinetic friction\n\n- Limiting static friction: **fₛ = μₛN**\n- Kinetic friction: **fₖ = μₖN**, with μₖ < μₛ\n- Angle of repose: **tan θ = μₛ**\n\n## Circular motion\n\n- Centripetal acceleration: **a = v²/r**, directed towards the centre\n- Maximum safe speed on a flat curve: **v = √(μrg)**',
        },
        { title: 'NCERT Chapter 5 (textbook)', kind: 'link', url: 'https://ncert.nic.in/textbook.php?keph1=5-8', durationMin: 30, content: 'Read sections 5.9 to 5.11 and solve the in-text examples.' },
        {
          title: 'Practice quiz: friction & circular motion', kind: 'quiz', durationMin: 5,
          questions: [
            mcq('A body moving in a circle at constant speed has:', ['Zero acceleration', 'Constant velocity', 'Acceleration towards the centre', 'Acceleration along the tangent'], 2, 'Uniform circular motion has centripetal acceleration v²/r.'),
            mcq('If the coefficient of static friction is 1, the angle of repose is:', ['30°', '45°', '60°', '90°'], 1, 'tan θ = μ = 1, so θ = 45°.'),
          ],
        },
      ],
    },
  ],
}

const MATHS10 = {
  title: 'Maths: Real Numbers',
  subject: 'Mathematics',
  description: 'Euclid\'s division lemma, the fundamental theorem of arithmetic and irrational numbers (CBSE Class 10, Chapter 1).',
  modules: [
    {
      title: 'Real numbers',
      lessons: [
        { title: 'Fundamental theorem of arithmetic', kind: 'reading', durationMin: 10, content: 'Every composite number can be written as a product of primes in **exactly one way** (apart from order).\n\n- **HCF** = product of the smallest power of each common prime factor\n- **LCM** = product of the greatest power of each prime factor\n- For two numbers: **HCF × LCM = a × b**' },
        { title: 'NCERT Chapter 1', kind: 'link', url: 'https://ncert.nic.in/textbook.php?jemh1=1-14', durationMin: 20 },
        {
          title: 'Chapter quiz', kind: 'quiz', durationMin: 5,
          questions: [
            mcq('HCF of 6 and 20 is:', ['1', '2', '4', '6'], 1, '6 = 2 × 3, 20 = 2² × 5, common factor 2.'),
            mcq('If HCF(a, b) = 4 and a × b = 96, LCM is:', ['12', '24', '48', '384'], 1, 'LCM = 96 / 4 = 24.'),
            mcq('√2 is:', ['Rational', 'Irrational', 'An integer', 'A whole number'], 1, '√2 cannot be written as p/q.'),
          ],
        },
      ],
    },
  ],
}

export async function seedLmsDemo() {
  const today = ymd()
  const batch = (name) => Batch.findOne({ name }).lean()
  const [jee, c12, c10, bca] = await Promise.all([batch('JEE 2027 - Target'), batch('Class 12 - Science'), batch('Class 10 - A'), batch('BCA - Year 2')])
  if (!jee || !c10) return
  const teacher = await User.findOne({ role: 'teacher' }).lean()
  const by = { createdBy: teacher?._id, teacherName: teacher?.name || 'Teacher' }

  const physics = await Course.create({ ...PHYSICS, ...by, batches: [jee._id, c12?._id].filter(Boolean), status: 'published' })
  const maths = await Course.create({ ...MATHS10, ...by, batches: [c10._id], status: 'published' })
  if (bca) {
    await Course.create({
      title: 'DBMS: SQL from scratch', subject: 'DBMS', ...by, batches: [bca._id], status: 'draft',
      description: 'Draft course — not visible to students until published.',
      modules: [{ title: 'Getting started', lessons: [{ title: 'What is a relational database?', kind: 'reading', content: 'Tables, rows, columns and keys.' }] }],
    })
  }

  // Progress: stronger students are further ahead.
  for (const [course, b] of [[physics, jee], [physics, c12], [maths, c10]]) {
    if (!b) continue
    const ids = lessonIds(course)
    const quizzes = new Map(course.modules.flatMap((m) => m.lessons).filter((l) => l.kind === 'quiz').map((l) => [String(l._id), l]))
    const students = await Student.find({ batch: b._id, status: 'active' }).sort({ rollNo: 1 }).lean()
    for (const s of students) {
      const n = Math.floor(rand() * (ids.length + 1))
      if (!n) continue
      const completed = ids.slice(0, n).map((id, i) => {
        const quiz = quizzes.get(id)
        const at = new Date(Date.now() - (n - i) * 86400000)
        if (!quiz) return { lesson: id, at }
        const answers = quiz.questions.map((q) => (rand() < 0.7 ? q.answer : (q.answer + 1) % q.options.length))
        const score = quiz.questions.reduce((a, q, qi) => a + (answers[qi] === q.answer ? q.marks : 0), 0)
        return { lesson: id, at, answers, score, total: quiz.questions.reduce((a, q) => a + q.marks, 0) }
      })
      await CourseProgress.create({ student: s._id, course: course._id, completed, lastLesson: ids[n - 1], lastAt: completed.at(-1).at })
    }
  }

  // Assignments with a mix of submitted, graded, returned and missing work.
  const plans = [
    { batch: jee, title: 'Laws of Motion: Worksheet 1', subject: 'Physics', course: physics._id, dueDate: addDays(today, 2), maxMarks: 20, instructions: 'Solve all 15 problems. Show free-body diagrams for Q5 to Q10. Upload a scan or photo (Google Drive link) or type your final answers.', share: 0.4 },
    { batch: jee, title: 'Units & Dimensions: Problem Set', subject: 'Physics', dueDate: addDays(today, -3), maxMarks: 10, instructions: 'Check the dimensional correctness of the 10 given equations.', share: 0.85, grade: true },
    { batch: c10, title: 'Real Numbers: Exercise 1.2', subject: 'Mathematics', course: maths._id, dueDate: addDays(today, 1), maxMarks: 10, instructions: 'NCERT Exercise 1.2, questions 1 to 7.', share: 0.5 },
    bca && { batch: bca, title: 'SQL Joins Practice', subject: 'DBMS', dueDate: addDays(today, 5), maxMarks: 25, instructions: 'Write 10 queries on the sample schema using INNER, LEFT and SELF joins.', share: 0.2 },
  ].filter(Boolean)
  for (const p of plans) {
    const a = await Assignment.create({ ...by, batch: p.batch._id, title: p.title, subject: p.subject, course: p.course, dueDate: p.dueDate, maxMarks: p.maxMarks, instructions: p.instructions })
    const students = await Student.find({ batch: p.batch._id, status: 'active' }).sort({ rollNo: 1 }).lean()
    for (const [i, s] of students.entries()) {
      if (rand() > p.share) continue
      const sub = {
        assignment: a._id, student: s._id, text: 'Answers attached in the Drive folder.', link: 'https://drive.google.com/drive/folders/demo',
        submittedAt: new Date(Date.now() - (i % 3) * 86400000), late: i % 5 === 4 && p.dueDate < today, status: 'submitted',
      }
      if (p.grade && i % 4 !== 3) Object.assign(sub, { status: 'graded', marks: Math.min(p.maxMarks, 4 + Math.floor(rand() * (p.maxMarks - 3))), feedback: 'Good work. Recheck Q7 — the dimensions of the constant are missing.', gradedBy: by.teacherName, gradedAt: new Date() })
      else if (p.grade) Object.assign(sub, { status: 'returned', feedback: 'Incomplete — please attempt Q6 to Q10 and resubmit.', gradedBy: by.teacherName, gradedAt: new Date() })
      await Submission.create(sub)
    }
  }

  // Leave applications: one waiting for the teacher, one already approved.
  const coa1 = await Student.findOne({ admissionNo: 'COA260001' }).lean()
  const parent = coa1 && (await User.findOne({ role: 'parent', children: coa1._id }).lean())
  if (coa1) {
    await LeaveRequest.create({ student: coa1._id, batch: coa1.batch, from: addDays(today, 1), to: addDays(today, 2), reason: 'Family wedding in Ajmer. Will cover the missed classes from the recorded lectures.', requestedBy: parent?._id, requestedByName: parent?.name || coa1.guardianName, requestedByRole: 'parent' })
  }
  const other = await Student.findOne({ batch: c10._id, status: 'active' }).sort({ rollNo: -1 }).lean()
  if (other) {
    const leave = await LeaveRequest.create({ student: other._id, batch: c10._id, from: addDays(today, -6), to: addDays(today, -5), reason: 'Fever, doctor advised rest.', requestedByName: other.guardianName, requestedByRole: 'parent', status: 'approved', reviewedBy: by.teacherName, reviewedAt: new Date(), reviewNote: 'Get well soon.' })
    await applyLeaveToAttendance(leave)
  }
}
