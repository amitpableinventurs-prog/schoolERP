import { api } from './api.js'

// Address of an uploaded file (photo, homework, banner, logo).
export const fileUrl = (id, download) => (id ? `/api/files/${id?._id || id}${download ? '?download=1' : ''}` : null)

const MB = 1024 * 1024
const LIMIT = { photo: 3 * MB, logo: 2 * MB, banner: 4 * MB, homework: 8 * MB, assignment: 8 * MB }

export const fmtSize = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error('Could not read the file. Please choose it again.'))
  reader.readAsDataURL(blob)
})

// Phone photos are often 4–10 MB (or HEIC). Redraw them smaller as JPEG (PNG for
// logos, to keep transparency) so they upload quickly on mobile data.
export async function shrinkImage(file, { max = 1600, keepPng = false } = {}) {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('This picture could not be opened. Please choose a JPG or PNG photo.'))
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const usable = /^image\/(jpeg|png|webp)$/.test(file.type)
    if (usable && scale === 1 && file.size < 600 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    const png = keepPng && file.type === 'image/png'
    if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const type = png ? 'image/png' : 'image/jpeg'
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
    if (!blob) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${png ? 'png' : 'jpg'}`, { type })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Uploads one file (photos are shrunk first). Returns { _id, name, mime, size }.
export async function uploadFile(file, purpose, extra = {}) {
  const isImage = file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isImage && !(isPdf && ['homework', 'assignment'].includes(purpose))) {
    throw new Error(['homework', 'assignment'].includes(purpose) ? 'Only PDF files or photos can be attached.' : 'Please choose a photo (JPG or PNG).')
  }
  const ready = isImage ? await shrinkImage(file, { max: purpose === 'photo' ? 720 : purpose === 'logo' ? 600 : 1600, keepPng: purpose === 'logo' || purpose === 'banner' }) : file
  const limit = LIMIT[purpose] || 8 * MB
  if (ready.size > limit) throw new Error(`"${file.name}" is ${fmtSize(ready.size)}. The limit is ${fmtSize(limit)}.`)
  return api.post('/files', { name: ready.name, data: await readAsDataUrl(ready), purpose, ...extra })
}
