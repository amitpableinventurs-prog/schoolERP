import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fileUrl } from '../lib/files.js'
import { useScope } from '../lib/scope.jsx'

// Home-screen banners set by the school (Front Office → App Banners). Slides every 6 s.
export default function BannerCarousel({ banners }) {
  const { to } = useScope()
  const [i, setI] = useState(0)
  const count = banners?.length || 0
  useEffect(() => {
    if (count < 2) return undefined
    const timer = setInterval(() => setI((x) => (x + 1) % count), 6000)
    return () => clearInterval(timer)
  }, [count])
  if (!count) return null
  const b = banners[Math.min(i, count - 1)]
  const body = (
    <>
      <img src={fileUrl(b.image)} alt={b.title} loading="eager" />
      {(b.title || b.subtitle) && (
        <span className="banner-text">
          <strong>{b.title}</strong>
          {b.subtitle && <span>{b.subtitle}</span>}
        </span>
      )}
    </>
  )
  // Portal links like /my/fees also work for parents (/child/:id/fees).
  const link = b.link?.startsWith('/my/') ? to(b.link.slice(4)) : b.link
  return (
    <div className="banner mb">
      {!link ? <div className="banner-slide">{body}</div>
        : link.startsWith('/') ? <Link className="banner-slide" to={link}>{body}</Link>
          : <a className="banner-slide" href={link} target="_blank" rel="noreferrer">{body}</a>}
      {count > 1 && (
        <>
          <button className="banner-nav prev" onClick={() => setI((i - 1 + count) % count)} aria-label="Previous banner"><ChevronLeft size={18} /></button>
          <button className="banner-nav next" onClick={() => setI((i + 1) % count)} aria-label="Next banner"><ChevronRight size={18} /></button>
          <div className="banner-dots">{banners.map((x, n) => <button key={x._id} className={n === i ? 'on' : ''} onClick={() => setI(n)} aria-label={`Banner ${n + 1}`} />)}</div>
        </>
      )}
    </div>
  )
}
