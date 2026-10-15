// Demo data so every screen has something to show on first start.
// `npm run seed` wipes the database and re-creates it.
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import {
  Attempt, Attendance, Batch, Doubt, Exam, FeeInstallment, Lead, Mark, Material, Notice,
  Setting, Staff, Student, Test, TimetableSlot, User,
} from './models.js'
import { DEFAULT_STUDENT_PASSWORD, ensureParentLogins, recomputeExam, recordPayment } from './services.js'
import { seedLmsDemo } from './seed-lms.js'
import { addDays, ymd } from './util.js'
import { config } from './config.js'
import { ensureRules } from './automation.js'

// Deterministic pseudo-random numbers so the demo looks the same every time.
let seedState = 42
const rand = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pickOne = (list) => list[Math.floor(rand() * list.length)]
const between = (min, max) => Math.round(min + rand() * (max - min))
const phone = () => `9${between(100000000, 999999999)}`

const FIRST_M = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Kabir', 'Aryan', 'Dev', 'Harsh', 'Yash', 'Manav', 'Rahul', 'Nikhil', 'Pranav', 'Shaurya', 'Atharv']
const FIRST_F = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Isha', 'Kavya', 'Riya', 'Myra', 'Pari', 'Anika', 'Sneha', 'Pooja', 'Neha', 'Tanvi', 'Khushi', 'Meera', 'Nisha', 'Shreya', 'Aditi', 'Priya']
const LAST = ['Sharma', 'Verma', 'Patel', 'Gupta', 'Singh', 'Yadav', 'Joshi', 'Mishra', 'Agarwal', 'Chauhan', 'Reddy', 'Nair', 'Iyer', 'Kumar', 'Jain', 'Tiwari', 'Pandey', 'Saxena', 'Mehta', 'Rao']
const FATHER = ['Rajesh', 'Suresh', 'Ramesh', 'Mahesh', 'Anil', 'Sunil', 'Vijay', 'Sanjay', 'Manoj', 'Ashok', 'Deepak', 'Rakesh']

const BATCHES = [
  { name: 'Class 10 - A', type: 'school', program: 'Class 10 (CBSE)', section: 'A', subjects: ['Mathematics', 'Science', 'English', 'Hindi', 'Social Science'], fee: 36000, installments: 4, timing: '8:00 AM - 1:30 PM', room: 'S-101' },
  { name: 'Class 12 - Science', type: 'school', program: 'Class 12 (CBSE) PCM/PCB', section: 'Sci', subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'], fee: 48000, installments: 4, timing: '8:00 AM - 2:00 PM', room: 'S-204' },
  { name: 'B.Sc CS - Year 1', type: 'college', program: 'B.Sc Computer Science', section: 'Sem 1', subjects: ['Programming in C', 'Discrete Mathematics', 'Digital Electronics', 'English Communication'], fee: 55000, installments: 2, timing: '10:00 AM - 4:00 PM', room: 'C-12' },
  { name: 'BCA - Year 2', type: 'college', program: 'Bachelor of Computer Applications', section: 'Sem 3', subjects: ['DBMS', 'Java Programming', 'Data Structures', 'Web Technology'], fee: 60000, installments: 2, timing: '10:00 AM - 4:00 PM', room: 'C-21' },
  { name: 'JEE 2027 - Target', type: 'coaching', program: 'JEE Main + Advanced', section: 'T1', subjects: ['Physics', 'Chemistry', 'Mathematics'], fee: 120000, installments: 6, timing: '4:00 PM - 8:00 PM', room: 'K-1' },
  { name: 'NEET 2027 - Achiever', type: 'coaching', program: 'NEET UG', section: 'A1', subjects: ['Physics', 'Chemistry', 'Biology'], fee: 110000, installments: 6, timing: '4:00 PM - 8:00 PM', room: 'K-2' },
  { name: 'Spoken English - Evening', type: 'coaching', program: 'Spoken English & Personality', section: 'E1', subjects: ['Spoken English', 'Grammar'], fee: 12000, installments: 2, timing: '6:00 PM - 7:30 PM', room: 'K-5' },
]

const STAFF = [
  { name: 'Dr. Meenakshi Iyer', designation: 'Principal', department: 'Administration', subjects: [] },
  { name: 'Rakesh Sharma', designation: 'Senior Teacher', department: 'Science', subjects: ['Physics', 'Science'] },
  { name: 'Sunita Verma', designation: 'Teacher', department: 'Mathematics', subjects: ['Mathematics', 'Discrete Mathematics'] },
  { name: 'Arvind Mishra', designation: 'Teacher', department: 'Chemistry', subjects: ['Chemistry'] },
  { name: 'Kavita Nair', designation: 'Teacher', department: 'Biology', subjects: ['Biology'] },
  { name: 'Prof. Anil Gupta', designation: 'Assistant Professor', department: 'Computer Science', subjects: ['Programming in C', 'Data Structures', 'Java Programming'] },
  { name: 'Neha Joshi', designation: 'Assistant Professor', department: 'Computer Science', subjects: ['DBMS', 'Web Technology', 'Digital Electronics'] },
  { name: 'Ritu Saxena', designation: 'Teacher', department: 'Languages', subjects: ['English', 'Hindi', 'English Communication', 'Spoken English', 'Grammar'] },
  { name: 'Manoj Tiwari', designation: 'Teacher', department: 'Social Science', subjects: ['Social Science'] },
  { name: 'Pankaj Agarwal', designation: 'Accountant', department: 'Accounts', subjects: [] },
  { name: 'Shalini Mehta', designation: 'Admission Counsellor', department: 'Admissions', subjects: [] },
]

const MCQS = [
  { q: 'A body moving in a circle at constant speed has:', options: ['Zero acceleration', 'Constant velocity', 'Acceleration towards the centre', 'Acceleration along the tangent'], answer: 2, explanation: 'Uniform circular motion has centripetal acceleration v²/r directed towards the centre.' },
  { q: 'The SI unit of impulse is:', options: ['N/s', 'N·s', 'kg·m/s²', 'J/s'], answer: 1, explanation: 'Impulse = Force × time, so N·s (same as kg·m/s).' },
  { q: 'If the velocity of a body is doubled, its kinetic energy becomes:', options: ['Double', 'Half', 'Four times', 'Unchanged'], answer: 2, explanation: 'KE = ½mv², so doubling v multiplies KE by 4.' },
  { q: 'Which law gives the relation F = ma?', options: ['Newton\'s first law', 'Newton\'s second law', 'Newton\'s third law', 'Law of gravitation'], answer: 1, explanation: 'Newton\'s second law: net force equals rate of change of momentum = ma for constant mass.' },
  { q: 'Dimensional formula of work is:', options: ['[MLT⁻²]', '[ML²T⁻²]', '[ML²T⁻³]', '[MLT⁻¹]'], answer: 1, explanation: 'Work = Force × distance = [MLT⁻²][L] = [ML²T⁻²].' },
]

// One admin per wing, allocated by the super admin.
export async function createDemoWingAdmins() {
  const hash = await bcrypt.hash('admin123', 10)
  const superAdmin = await User.findOne({ role: 'superadmin' }).lean()
  for (const [wing, name] of [['school', 'Anita Kapoor'], ['college', 'Dr. Vikram Sethi'], ['coaching', 'Rohit Malhotra']]) {
    await User.updateOne(
      { loginId: `${wing}@campus.local` },
      { $setOnInsert: { name, loginId: `${wing}@campus.local`, role: 'admin', wings: [wing], passwordHash: hash, createdBy: superAdmin?._id } },
      { upsert: true },
    )
  }
}

export async function wipeDatabase() {
  await mongoose.connection.dropDatabase()
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()))
}

export async function seedDemoData(initialAdmin) {
  const today = ymd()
  console.log('[seed] Creating demo data…')

  await Setting.create({
    instituteName: 'Smart Vidya Campus', tagline: 'School • College • Coaching',
    phone: '+91 98765 43210', email: 'info@smartvidya.local', address: 'Civil Lines, Jaipur, Rajasthan',
  })

  const staff = await Staff.insertMany(STAFF.map((s) => ({
    ...s, phone: phone(), email: `${s.name.toLowerCase().replace(/^(dr|prof)\.\s*/, '').split(' ')[0]}@smartvidya.local`,
    salary: between(28, 75) * 1000, joiningDate: addDays(today, -between(200, 2500)), status: 'active',
  })))
  const teacherFor = (subject) => staff.find((s) => s.subjects.includes(subject)) || staff[1]

  // Logins: admin from .env plus one demo account per staff role.
  const hash = (p) => bcrypt.hash(p, 10)
  await User.create([
    { name: initialAdmin.name, loginId: initialAdmin.email, passwordHash: await hash(initialAdmin.password), role: 'superadmin' },
    { name: staff[1].name, loginId: 'teacher@campus.local', passwordHash: await hash('teacher123'), role: 'teacher', staff: staff[1]._id },
    { name: staff[9].name, loginId: 'accounts@campus.local', passwordHash: await hash('accounts123'), role: 'accountant', staff: staff[9]._id },
    { name: staff[10].name, loginId: 'counsellor@campus.local', passwordHash: await hash('counsellor123'), role: 'counsellor', staff: staff[10]._id },
  ])

  const batches = await Batch.insertMany(BATCHES.map((b) => ({
    ...b, academicYear: '2026-27', capacity: 40, classTeacher: teacherFor(b.subjects[0])._id, status: 'active',
  })))

  // Students: 9-11 per batch. "ability" drives marks and attendance so the analytics have a story.
  const studentHash = await hash(DEFAULT_STUDENT_PASSWORD)
  const studentDocs = []
  const counters = { school: 0, college: 0, coaching: 0 }
  const prefix = { school: 'SCH', college: 'CLG', coaching: 'COA' }
  for (const batch of batches) {
    const count = between(9, 11)
    for (let i = 0; i < count; i++) {
      const female = rand() < 0.48
      const first = pickOne(female ? FIRST_F : FIRST_M)
      const last = pickOne(LAST)
      const ageBase = { school: batch.name.includes('10') ? 15 : 17, college: batch.name.includes('Year 2') ? 19 : 18, coaching: batch.name.includes('English') ? 21 : 17 }[batch.type]
      const dob = `${2026 - ageBase}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`
      counters[batch.type]++
      studentDocs.push({
        admissionNo: `${prefix[batch.type]}26${String(counters[batch.type]).padStart(4, '0')}`,
        name: `${first} ${last}`, gender: female ? 'female' : 'male',
        dob: studentDocs.length === 3 ? `${2026 - ageBase}-${today.slice(5)}` : dob, // one birthday today
        phone: phone(), email: `${first.toLowerCase()}.${last.toLowerCase()}${between(1, 99)}@mail.local`,
        guardianName: `${pickOne(FATHER)} ${last}`, guardianPhone: phone(),
        address: pickOne(['Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C-Scheme', 'Raja Park', 'Jagatpura']) + ', Jaipur',
        batch: batch._id, rollNo: i + 1, admissionDate: addDays(today, -between(152, 170)), status: 'active',
        _ability: rand(),
      })
    }
  }
  // Siblings: the first school student and the first coaching student share a guardian,
  // so the demo parent login (9876500001) shows the child switcher.
  const elder = studentDocs.find((d) => d.admissionNo === 'COA260001')
  const younger = studentDocs.find((d) => d.admissionNo === 'SCH260001')
  if (elder && younger) {
    const surname = elder.name.split(' ').slice(1).join(' ')
    Object.assign(younger, { name: `${younger.name.split(' ')[0]} ${surname}`, guardianName: elder.guardianName, address: elder.address })
    elder.guardianPhone = younger.guardianPhone = '9876500001'
  }
  const students = await Student.insertMany(studentDocs)
  const ability = new Map(students.map((s, i) => [String(s._id), studentDocs[i]._ability]))
  await User.insertMany(students.map((s) => ({ name: s.name, loginId: s.admissionNo.toLowerCase(), passwordHash: studentHash, role: 'student', student: s._id })))

  // Attendance for the last 35 days (Sundays off).
  const attendance = []
  for (let d = 34; d >= 0; d--) {
    const date = addDays(today, -d)
    if (new Date(`${date}T00:00:00`).getDay() === 0) continue
    for (const s of students) {
      const a = ability.get(String(s._id))
      const pPresent = 0.6 + a * 0.38
      const r = rand()
      attendance.push({ student: s._id, batch: s.batch, date, status: r < pPresent ? 'P' : r < pPresent + 0.04 ? 'L' : 'A' })
    }
  }
  await Attendance.insertMany(attendance)

  // Fees: installment plan starting ~3 months ago; most past dues paid.
  for (const s of students) {
    const batch = batches.find((b) => String(b._id) === String(s.batch))
    const count = batch.installments
    const gap = Math.round(360 / count)
    const base = Math.floor(batch.fee / count)
    const start = addDays(today, -150)
    const insts = await FeeInstallment.insertMany(Array.from({ length: count }, (_, i) => ({
      student: s._id, batch: batch._id, title: count === 1 ? 'Full fee' : `Installment ${i + 1} of ${count}`,
      amount: i === count - 1 ? batch.fee - base * (count - 1) : base, dueDate: addDays(start, i * gap),
    })))
    const a = ability.get(String(s._id))
    // Paid a few days before/after the due date, never in the future.
    const paidDate = (due) => { const d = addDays(due, between(-5, 6)); return d > today ? today : d }
    for (const inst of insts) {
      if (inst.dueDate > addDays(today, 5)) break
      const r = rand()
      const willPay = a > 0.25 ? r < 0.9 : r < 0.45
      if (!willPay) continue
      const partial = rand() < 0.1
      await recordPayment({
        student: s._id, installment: inst._id, amount: partial ? Math.round(inst.amount / 2) : inst.amount,
        mode: pickOne(['upi', 'upi', 'cash', 'bank', 'card']), paidOn: paidDate(inst.dueDate),
      })
    }
  }

  // Two exams per batch with marks.
  for (const batch of batches) {
    const bStudents = students.filter((s) => String(s.batch) === String(batch._id))
    const plan = batch.type === 'coaching'
      ? [{ name: 'Mock Test 1', type: 'mock', date: addDays(today, -38) }, { name: 'Mock Test 2', type: 'mock', date: addDays(today, -9) }]
      : [{ name: 'Unit Test 1', type: 'unit', date: addDays(today, -40) }, { name: batch.type === 'college' ? 'Internal Assessment 1' : 'Mid Term', type: 'mid', date: addDays(today, -10) }]
    for (const [idx, e] of plan.entries()) {
      const exam = await Exam.create({ ...e, batch: batch._id, subjects: batch.subjects.map((name) => ({ name, maxMarks: e.type === 'unit' ? 25 : 100 })), published: idx === 0 })
      await Mark.insertMany(bStudents.map((s) => {
        const a = ability.get(String(s._id))
        // A few weak students slide in the second exam so "falling marks" shows up.
        const drift = idx === 1 && a < 0.3 ? -0.15 : 0
        return {
          exam: exam._id, student: s._id,
          scores: exam.subjects.map((sub) => ({ subject: sub.name, marks: Math.max(0, Math.min(sub.maxMarks, Math.round(sub.maxMarks * (0.3 + a * 0.6 + drift + (rand() - 0.5) * 0.2)))) })),
        }
      }))
      await recomputeExam(exam._id)
    }
  }

  // Online test for the JEE batch, with a few attempts.
  const jee = batches[4]
  const test = await Test.create({ title: 'Physics - Laws of Motion (Quick Quiz)', batch: jee._id, subject: 'Physics', topic: 'Laws of Motion', durationMin: 10, negativeMarks: 1, questions: MCQS.map((q) => ({ ...q, marks: 4 })), status: 'published' })
  for (const s of students.filter((x) => String(x.batch) === String(jee._id)).slice(0, 6)) {
    const a = ability.get(String(s._id))
    const answers = MCQS.map((q) => (rand() < 0.35 + a * 0.6 ? q.answer : (q.answer + 1) % 4))
    const correct = answers.filter((ans, i) => ans === MCQS[i].answer).length
    await Attempt.create({ test: test._id, student: s._id, answers, correct, wrong: 5 - correct, score: correct * 4 - (5 - correct), total: 20, startedAt: new Date(Date.now() - 86400000), submittedAt: new Date(Date.now() - 86000000) })
  }

  // Weekly timetable.
  const slots = []
  const times = [['08:00', '08:45'], ['08:45', '09:30'], ['09:45', '10:30'], ['10:30', '11:15']]
  const coachingTimes = [['16:00', '17:20'], ['17:30', '18:50']]
  for (const batch of batches) {
    const t = batch.type === 'coaching' ? (batch.name.includes('English') ? [['18:00', '19:30']] : coachingTimes) : batch.type === 'college' ? [['10:00', '11:00'], ['11:00', '12:00'], ['13:00', '14:00']] : times
    for (let day = 1; day <= 6; day++) {
      t.forEach(([start, end], i) => {
        const subject = batch.subjects[(day + i) % batch.subjects.length]
        slots.push({ batch: batch._id, day, start, end, subject, teacher: teacherFor(subject)._id, room: batch.room })
      })
    }
  }
  await TimetableSlot.insertMany(slots)

  await Material.insertMany([
    { batch: jee._id, subject: 'Physics', title: 'Laws of Motion - Formula Sheet', kind: 'notes', url: 'https://ncert.nic.in/textbook.php?keph1=5-8', description: 'All formulas + 20 solved examples.' },
    { batch: jee._id, subject: 'Mathematics', title: 'Quadratic Equations - DPP 4', kind: 'assignment', description: 'Daily practice problems. Submit in class.', dueDate: addDays(today, 3) },
    { batch: batches[5]._id, subject: 'Biology', title: 'Cell Structure - Video Lecture', kind: 'video', url: 'https://www.youtube.com/results?search_query=cell+structure+neet', description: '45 min recorded lecture.' },
    { batch: batches[0]._id, subject: 'Mathematics', title: 'Real Numbers - NCERT Solutions', kind: 'notes', url: 'https://ncert.nic.in/textbook.php?jemh1=1-14' },
    { batch: batches[3]._id, subject: 'DBMS', title: 'SQL Joins Practice', kind: 'assignment', description: 'Write 10 queries on the sample schema.', dueDate: addDays(today, 5) },
    { subject: 'General', title: 'Academic Calendar 2026-27', kind: 'link', url: 'https://example.com/calendar', description: 'Holidays, exams and events.' },
  ])

  await Notice.insertMany([
    { title: 'Diwali Holidays', body: 'The campus will remain closed from 20 Oct to 25 Oct for Diwali. Coaching batches will have online doubt sessions on 23 Oct.', audience: 'all', pinned: true, createdBy: 'Admin' },
    { title: 'Parent-Teacher Meeting', body: 'PTM for Class 10 and Class 12 will be held on Saturday, 10 AM - 1 PM. Report cards of the Mid Term will be shared.', audience: 'students', createdBy: 'Admin' },
    { title: 'JEE Mock Test Series', body: 'Full-length JEE mock tests begin next Sunday, 9 AM. Carry your admit card.', audience: 'students', batch: jee._id, createdBy: 'Admin' },
    { title: 'Staff Meeting', body: 'All teaching staff to attend a meeting on the new assessment pattern on Friday 3 PM in the conference room.', audience: 'staff', createdBy: 'Admin' },
  ])

  const jeeStudents = students.filter((x) => String(x.batch) === String(jee._id))
  await Doubt.insertMany([
    { student: jeeStudents[0]._id, batch: jee._id, subject: 'Physics', question: 'Pseudo force kab lagate hain? Lift wale question me confuse ho jata hoon.', status: 'open' },
    { student: jeeStudents[1]._id, batch: jee._id, subject: 'Mathematics', question: 'How to find the range of f(x) = (x^2+1)/(x^2-1)?', status: 'answered', teacherAnswer: 'Put y = (x²+1)/(x²-1), solve for x² = (y+1)/(y-1) and use x² ≥ 0, x² ≠ 1. Range: (-∞, -1] ∪ (1, ∞).', answeredBy: 'Sunita Verma' },
  ])

  const LEADS = [
    ['Rohit Kumar', 'JEE 2027 - Target', 'coaching', 'website', 'new', 0], ['Simran Kaur', 'NEET 2027 - Achiever', 'coaching', 'referral', 'demo', 1],
    ['Aman Gupta', 'Class 11 Science', 'school', 'walkin', 'visited', 0], ['Priyanka Rao', 'BCA', 'college', 'social', 'contacted', -2],
    ['Vikas Yadav', 'JEE 2027 - Target', 'coaching', 'ads', 'contacted', -4], ['Sana Khan', 'Spoken English', 'coaching', 'walkin', 'new', 0],
    ['Harshit Jain', 'B.Sc CS', 'college', 'website', 'demo', 2], ['Muskan Agarwal', 'NEET 2027 - Achiever', 'coaching', 'call', 'new', -1],
    ['Deepak Chauhan', 'Class 9', 'school', 'referral', 'converted', null], ['Tanya Singh', 'JEE 2027 - Target', 'coaching', 'social', 'lost', null],
    ['Gaurav Mehta', 'BCA', 'college', 'ads', 'contacted', 3], ['Ritika Sharma', 'Spoken English', 'coaching', 'referral', 'visited', 1],
    ['Kunal Verma', 'Class 11 Commerce', 'school', 'walkin', 'new', 0], ['Payal Mishra', 'NEET 2027 - Achiever', 'coaching', 'website', 'demo', -3],
  ]
  await Lead.insertMany(LEADS.map(([name, course, type, source, status, follow], i) => ({
    name, phone: phone(), email: i % 3 ? `${name.split(' ')[0].toLowerCase()}@mail.local` : undefined, course, type, source, status,
    nextFollowUp: follow == null ? undefined : addDays(today, follow),
    notes: status === 'demo' ? 'Attended free demo class, parents want fee details.' : status === 'visited' ? 'Visited campus with father.' : '',
    followUps: status === 'new' ? [] : [{ note: 'Called, shared brochure on WhatsApp.', at: new Date(Date.now() - 4 * 86400000), by: 'Shalini Mehta' }],
    createdAt: new Date(Date.now() - between(1, 25) * 86400000),
  })))

  await ensureParentLogins()
  await seedLmsDemo()
  await createDemoWingAdmins()

  console.log(`[seed] Done: ${batches.length} batches, ${students.length} students, ${staff.length} staff.`)
}

// CLI: `npm run seed` — wipes and re-creates the demo database.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!config.auth.initialAdmin.password) {
    console.error('Set ADMIN_PASSWORD in .env first.')
    process.exit(1)
  }
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  if (process.argv.includes('--reset')) await wipeDatabase()
  await seedDemoData(config.auth.initialAdmin)
  await ensureRules()
  await mongoose.disconnect()
}
