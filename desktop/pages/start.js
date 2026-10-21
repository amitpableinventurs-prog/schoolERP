// Start window: activation form, or progress while the local server gets ready.
const params = new URLSearchParams(location.search)
const mode = params.get('mode')
const info = JSON.parse(params.get('info') || '{}')
const $ = (id) => document.getElementById(id)

if (mode === 'activate') {
  $('activate').hidden = false
  $('key').value = info.key || ''
  $('url').value = info.centralUrl || ''
  if (info.error) { $('error').textContent = info.error; $('error').hidden = false }
  $('form').addEventListener('submit', async (event) => {
    event.preventDefault()
    $('go').disabled = true
    $('go').textContent = 'Activating…'
    $('error').hidden = true
    const result = await window.sc.activate($('key').value, $('url').value)
    if (result.ok) {
      $('ok').textContent = `Activated for ${result.institute} (${result.label}). Starting…`
      $('ok').hidden = false
    } else {
      $('error').textContent = result.error
      $('error').hidden = false
      $('go').disabled = false
      $('go').textContent = 'Activate'
    }
  })
} else {
  $('loading').hidden = false
  if (info.text) $('status').textContent = info.text
  window.sc.onStatus((status) => {
    if (status.text) $('status').textContent = status.text
    $('loadError').hidden = !status.error
    if (status.error) $('loadError').textContent = status.error
  })
}
