/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, institute: null })

  const refresh = useCallback(() => api.get('/auth/me').then(
    (data) => setState({ loading: false, user: data.user, institute: data.institute }),
    () => setState({ loading: false, user: null, institute: null })
  ), [])

  useEffect(() => {
    refresh()
    const onExpired = () => setState((s) => ({ ...s, user: null }))
    window.addEventListener('session-expired', onExpired)
    return () => window.removeEventListener('session-expired', onExpired)
  }, [refresh])

  const login = async (loginId, password, as) => {
    await api.post('/auth/login', { loginId, password, as })
    await refresh()
  }

  const logout = async () => {
    await api.post('/auth/logout')
    setState({ loading: false, user: null, institute: null })
  }

  return <AuthContext.Provider value={{ ...state, login, logout, refresh }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

// Which staff roles can open which section (admin sees everything).
export const ACCESS = {
  dashboard: ['teacher', 'accountant', 'counsellor'],
  students: ['teacher', 'accountant', 'counsellor'],
  insights: ['teacher', 'counsellor'],
  staff: [],
  batches: ['teacher', 'accountant', 'counsellor'],
  attendance: ['teacher'],
  timetable: ['teacher'],
  exams: ['teacher'],
  tests: ['teacher'],
  papers: ['teacher'],
  materials: ['teacher'],
  doubts: ['teacher'],
  fees: ['accountant'],
  leads: ['counsellor'],
  notices: ['teacher', 'accountant', 'counsellor'],
  automation: ['teacher', 'accountant', 'counsellor'],
  assistant: ['teacher', 'accountant', 'counsellor'],
  settings: [],
  lms: ['teacher'],
  assignments: ['teacher'],
  leaves: ['teacher'],
  transport: ['teacher', 'accountant'],
  transportFees: ['accountant'],
  certificates: ['teacher', 'accountant'],
  payroll: ['accountant'],
  finance: ['accountant'],
  myPayslips: ['teacher', 'accountant', 'counsellor'],
  // Super admin only:
  admins: [],
  activity: [],
}
const SUPER_ONLY = ['admins', 'activity']

export const isAdmin = (user) => user?.role === 'admin' || user?.role === 'superadmin'
export const can = (user, section) => user?.role === 'superadmin'
  || (user?.role === 'admin' && !SUPER_ONLY.includes(section))
  || (ACCESS[section] || []).includes(user?.role)

// Wings (school / college / coaching) the user works in; null wings = the whole institute.
export const WINGS = ['school', 'college', 'coaching']
export const WING_LABEL = { school: 'School', college: 'College', coaching: 'Coaching' }
export const myWings = (user) => user?.wings || WINGS

export const ROLE_NAME = { superadmin: 'Super admin', admin: 'Wing admin', teacher: 'Teacher', accountant: 'Accountant', counsellor: 'Counsellor', student: 'Student', parent: 'Parent' }
