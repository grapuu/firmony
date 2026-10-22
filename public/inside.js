// Firmony, the client's app: the one script, and every page works without it. It sends a document as soon as it
// is picked (a photo made smaller first, so that it goes quickly over a phone's network), takes files dropped on
// the card for adding them, looks again at a document that is being read, and copies the address for forwarding.
;(function () {
  'use strict'
  document.documentElement.classList.add('js')

  var MAX_SIDE = 2400
  var SMALL_ENOUGH = 1200000

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn)
    else fn()
  }

  /** A photo as a JPEG of at most 2400 px on its long side; anything that cannot be made smaller goes as it is. */
  function smaller(file) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size <= SMALL_ENOUGH || !window.createImageBitmap) return Promise.resolve(file)
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .then(function (bitmap) {
        var scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
        var canvas = document.createElement('canvas')
        canvas.width = Math.round(bitmap.width * scale)
        canvas.height = Math.round(bitmap.height * scale)
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        if (bitmap.close) bitmap.close()
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) { resolve(blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file) }, 'image/jpeg', 0.86)
        })
      })
      .catch(function () { return file })
  }

  var batches = []
  var context = document.body.getAttribute('data-client-context')
  var leaving = false

  function hasDraft() {
    return Array.prototype.some.call(document.querySelectorAll('form[data-message] textarea'), function (area) { return area.value.trim() !== '' })
  }

  window.addEventListener('beforeunload', function (event) {
    if (leaving || (!hasDraft() && !batches.some(function (batch) { return batch.rows.some(function (row) { return row.state !== 'done' && row.state !== 'rejected' }) }))) return
    event.preventDefault()
    event.returnValue = ''
  })

  function nextPage(path) {
    if (typeof path !== 'string' || !/^\/app(?:[/?#]|$)/.test(path)) throw new Error('bad receipt')
    leaving = true
    location.assign(path)
  }

  async function receiptRequest(action, data) {
    var controller = new AbortController()
    var timeout = setTimeout(function () { controller.abort() }, 45000)
    try {
      var res = await fetch(action, { method: 'POST', body: data, credentials: 'same-origin', redirect: 'error', signal: controller.signal, headers: { accept: 'application/json', 'x-firmony-context': context } })
      var receipt = res.headers.get('content-type') && res.headers.get('content-type').includes('application/json') ? await res.json() : null
      return { res: res, receipt: receipt }
    } finally { clearTimeout(timeout) }
  }

  function accessLink() {
    var link = document.createElement('a')
    link.href = '/app'
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'Overiť prístup v ďalšom okne'
    return link
  }

  /** Each selected file keeps its own receipt. A dropped answer stays uncertain until a deliberate retry. */
  function send(form, files) {
    if (!files.length || form.classList.contains('is-busy')) return
    var previous = batches.find(function (batch) { return batch.form === form })
    if (previous && previous.rows.some(function (row) { return row.state !== 'done' })) {
      files.forEach(function (file) {
        var item = document.createElement('li')
        previous.list.appendChild(item)
        previous.rows.push({ file: file, ready: null, item: item, state: 'waiting', note: 'Čaká na odoslanie' })
      })
      previous.run()
      return
    }
    if (previous) previous.box.remove()
    var card = form.closest('.add, .need, .have') || form
    var box = document.createElement('section')
    box.className = 'upload-status'
    box.tabIndex = -1
    box.setAttribute('aria-label', 'Odosielanie dokladov')
    var status = document.createElement('p')
    status.setAttribute('role', 'status')
    var list = document.createElement('ul')
    var controls = document.createElement('div')
    controls.className = 'upload-status__controls'
    box.append(status, list, controls)
    // The universal picker is hidden. Its receipt belongs in the visible main content.
    if (form.id === 'pick') document.getElementById('obsah').prepend(box)
    else form.appendChild(box)
    var batch = { form: form, box: box, list: list, rows: files.map(function (file) {
      var item = document.createElement('li')
      list.appendChild(item)
      return { file: file, ready: null, item: item, state: 'waiting', note: 'Čaká na odoslanie' }
    }), next: '/app/doklady' }
    batches = batches.filter(function (entry) { return entry !== previous })
    batches.push(batch)

    function paint() {
      batch.rows.forEach(function (row) { row.item.textContent = row.file.name + ': ' + row.note })
      status.textContent = 'Potvrdené súbory: ' + batch.rows.filter(function (row) { return row.state === 'done' }).length + ' z ' + batch.rows.length + '.'
    }
    async function run() {
      form.classList.add('is-busy')
      card.classList.add('is-busy')
      controls.replaceChildren()
      paint()
      for (var row of batch.rows) {
        if (row.state === 'done' || row.state === 'rejected') continue
        row.state = 'sending'
        row.note = 'Odosiela sa'
        paint()
        try {
          row.ready = row.ready || await smaller(row.file)
          var data = new FormData(form)
          data.delete('file')
          data.append('file', row.ready, row.ready.name)
          var answer = await receiptRequest(form.action, data)
          var res = answer.res, receipt = answer.receipt
          if (!res.ok || !receipt || receipt.upload !== 1 || receipt.context !== context || receipt.accepted !== 1 || receipt.problems.length) {
            row.state = res.status === 422 ? 'rejected' : 'retry'
            row.note = receipt && (receipt.error || (receipt.problems && receipt.problems.join(' '))) || 'Prijatie sa nepodarilo potvrdiť. Overte prístup a skúste to znova.'
            if (row.state === 'retry') break
            continue
          }
          row.state = 'done'
          row.note = receipt.known ? 'Už ho máme, druhý doklad nevznikol' : receipt.statements ? 'Výpis prijatý, stav nájdete v Platbách' : 'Prijatie potvrdené'
          batch.next = receipt.next
        } catch (error) {
          row.state = 'retry'
          row.note = 'Spojenie sa prerušilo. Prijatie zatiaľ nemáme potvrdené.'
          break
        }
      }
      form.classList.remove('is-busy')
      card.classList.remove('is-busy')
      paint()
      var remaining = batch.rows.some(function (row) { return row.state !== 'done' })
      if (!remaining && !hasDraft() && !batches.some(function (other) { return other !== batch && other.rows.some(function (row) { return row.state !== 'done' }) })) {
        var destination = new URL(batch.next, location.origin)
        destination.searchParams.set('ok', 'prijate')
        destination.searchParams.set('n', String(batch.rows.length))
        return nextPage(destination.pathname + destination.search)
      }
      if (batch.rows.some(function (row) { return row.state === 'retry' || row.state === 'waiting' })) {
        var retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'btn btn--blue btn--small'
        retry.textContent = 'Skúsiť nepotvrdené znova'
        retry.addEventListener('click', run)
        controls.append(retry, accessLink())
      }
      if (remaining) {
        var choose = document.createElement('button')
        choose.type = 'button'
        choose.className = 'btn btn--line btn--small'
        choose.textContent = 'Vybrať ďalšie súbory'
        choose.addEventListener('click', function () {
          var input = form.querySelector('input[type=file]')
          input.value = ''
          input.click()
        })
        controls.appendChild(choose)
      }
      if (batch.rows.some(function (row) { return row.state === 'done' })) {
        var view = document.createElement('a')
        view.href = batch.next
        view.textContent = 'Pozrieť prijaté súbory'
        controls.appendChild(view)
      }
      box.focus()
    }
    batch.run = run
    run()
  }

  function hasUploadReceipt(form) {
    // Only these endpoints implement the per-document receipt. Bank statements and powers of attorney
    // keep their own native form, redirect and validation; a successful HTML answer is not this protocol.
    var path = new URL(form.action, location.href).pathname
    return path === '/app/doklady' || /^\/app\/platby\/[^/]+\/doklad$/.test(path)
  }

  ready(function () {
    // A file is sent as soon as it is picked. Listened for on the whole page, so that a part of it that is
    // fetched again (below) still works.
    document.addEventListener('change', function (event) {
      var input = event.target
      if (!input || !input.matches || !input.matches('form[data-upload] input[type=file]')) return
      var form = input.form
      if (!input.files || !input.files.length) return
      if (!hasUploadReceipt(form)) return form.submit()
      send(form, Array.prototype.slice.call(input.files))
    })

    document.addEventListener('submit', function (event) {
      var form = event.target
      if (form.matches('form[data-upload]') && hasUploadReceipt(form)) {
        event.preventDefault()
        var existing = batches.find(function (batch) { return batch.form === form && batch.rows.some(function (row) { return row.state !== 'done' }) })
        if (existing) return existing.box.focus()
        var input = form.querySelector('input[type=file]')
        if (input && input.files.length) send(form, Array.from(input.files))
        else if (input) input.click()
      }
      if (!form.matches('form[data-message]')) return
      event.preventDefault()
      if (form.classList.contains('is-busy')) return
      var area = form.querySelector('textarea')
      var button = form.querySelector('button[type=submit]')
      var data = new FormData(form)
      var status = form.querySelector('[data-send-status]')
      if (!status) {
        status = document.createElement('p')
        status.className = 'composer__error'
        status.setAttribute('data-send-status', '')
        status.setAttribute('role', 'status')
        form.appendChild(status)
      }
      status.textContent = 'Správa sa odosiela.'
      form.classList.add('is-busy')
      area.readOnly = true
      button.disabled = true
      receiptRequest(form.action, data)
        .then(function (answer) {
          var res = answer.res, receipt = answer.receipt
          if (res.ok && receipt && receipt.message === 1 && receipt.context === context && receipt.id === data.get('odoslanie')) {
            area.value = ''
            return nextPage(receipt.next)
          }
          if (receipt && receipt.error && res.status < 500) {
            status.textContent = receipt.error
            area.readOnly = false
          } else throw new Error('unconfirmed message')
        })
        .catch(function () {
          status.textContent = 'Odoslanie zatiaľ nemáme potvrdené. Text zostal tu. Skúste odoslanie znova, rovnaká správa sa neuloží dvakrát. '
          status.appendChild(accessLink())
        })
        .finally(function () { form.classList.remove('is-busy'); button.disabled = false })
    })

    // "Add a document" anywhere opens the camera or the files at once.
    var pick = document.getElementById('pick-file')
    document.querySelectorAll('[data-pick]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        var local = document.querySelector('.add input[type=file]')
        var input = local || pick
        if (!input) return
        event.preventDefault()
        input.click()
      })
    })

    // Files dropped on the card for adding them.
    document.querySelectorAll('[data-drop]').forEach(function (zone) {
      var form = zone.querySelector('form[data-upload]')
      if (!form || !hasUploadReceipt(form)) return
      var depth = 0
      zone.addEventListener('dragenter', function (event) {
        event.preventDefault()
        depth++
        zone.classList.add('is-over')
      })
      zone.addEventListener('dragover', function (event) { event.preventDefault() })
      zone.addEventListener('dragleave', function () {
        depth = Math.max(0, depth - 1)
        if (!depth) zone.classList.remove('is-over')
      })
      zone.addEventListener('drop', function (event) {
        event.preventDefault()
        depth = 0
        zone.classList.remove('is-over')
        var files = event.dataTransfer && event.dataTransfer.files ? Array.prototype.slice.call(event.dataTransfer.files) : []
        send(form, files)
      })
    })

    // The address for forwarding, copied with one tap.
    document.querySelectorAll('[data-copy]').forEach(function (button) {
      button.hidden = false
      button.addEventListener('click', function () {
        var text = button.getAttribute('data-copy')
        var label = button.textContent
        var done = function () {
          button.textContent = button.getAttribute('data-done') || label
          setTimeout(function () { button.textContent = label }, 2000)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {})
      })
    })

    // An invoice: printed, or saved as a PDF from the print dialog.
    document.querySelectorAll('[data-print]').forEach(function (button) {
      button.hidden = false
      button.addEventListener('click', function () { window.print() })
    })

    // A document being read: the parts of the page that show it are fetched again until it is read.
    var tries = 0
    function look() {
      if (!document.querySelector('[data-live="1"]') || tries++ > 40) return
      setTimeout(function () {
        fetch(location.href, { credentials: 'same-origin', headers: { accept: 'text/html' } })
          .then(function (res) { return res.ok ? res.text() : '' })
          .then(function (html) {
            if (!html) return
            var fresh = new DOMParser().parseFromString(html, 'text/html')
            fresh.querySelectorAll('[data-part]').forEach(function (part) {
              var here = document.querySelector('[data-part="' + part.getAttribute('data-part') + '"]')
              if (here && here.innerHTML !== part.innerHTML) here.replaceWith(document.importNode(part, true))
            })
            look()
          })
          .catch(look)
      }, 2500)
    }
    look()
  })
})()
