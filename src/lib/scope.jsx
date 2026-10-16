/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { Empty } from '../components/ui.jsx'

// Student portal pages are shared with the parent portal. The scope says whose
// records a page shows, where its API lives and where its links point.
const STUDENT_SCOPE = {
  viewer: 'student',
  api: '/portal',
  to: (path = '') => (path ? `/my/${path}` : '/'),
  my: (thing) => `My ${thing}`,
  readOnly: false,
  child: null,
}

const ScopeContext = createContext(STUDENT_SCOPE)
export const useScope = () => useContext(ScopeContext)

// Route element for /child/:childId/* in the parent portal.
export function ChildScope() {
  const { childId } = useParams()
  const { user } = useAuth()
  const child = user.children?.find((c) => c._id === childId)
  if (!child) return <Empty text="This student is not linked to your account." />
  const first = child.name.split(' ')[0]
  const value = {
    viewer: 'parent',
    api: `/parent/children/${child._id}`,
    to: (path = '') => `/child/${child._id}${path ? `/${path}` : ''}`,
    my: (thing) => `${first}'s ${thing}`,
    readOnly: true,
    child,
  }
  return <ScopeContext.Provider value={value}><Outlet /></ScopeContext.Provider>
}
