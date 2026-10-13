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

  function progress(form, done, total) {
    var box = form.querySelector('.progress')
    if (!box) {
      box = document.createElement('div')
      box.className = 'progress'
      box.setAttribute('role', 'status')
      box.innerHTML = '<span class="progress__text"></span><span class="progress__bar"><span class="progress__fill"></span></span>'
      form.appendChild(box)
    }
    box.querySelector('.progress__text').textContent = total === 1 ? 'Odosiela sa doklad…' : 'Odosiela sa ' + Math.min(done + 1, total) + ' z ' + total + '…'
    box.querySelector('.progress__fill').style.width = Math.round((done / total) * 100) + '%'
  }

  /** Puts a whole page the server answered in place of this one: a form that came back with a message. */
  function show(html) {
    document.open()
    document.write(html)
    document.close()
  }

  /** Sends the files of a form one by one, then goes where the last answer leads. */
  function send(form, files) {
    if (!files.length || form.classList.contains('is-busy')) return
    var card = form.closest('.add, .need, .have') || form
    card.classList.add('is-busy')
    form.classList.add('is-busy')
    var total = files.length
    var last = null
    var chain = Promise.resolve()
    files.forEach(function (file, index) {
      chain = chain.then(function () {
        progress(form, index, total)
        return smaller(file).then(function (ready) {
          var data = new FormData()
          data.append('file', ready, ready.name)
          return fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' }).then(function (res) {
            if (!res.ok) return res.text().then(function (html) { throw { html: html } })
            last = res
          })
        })
      })
    })
    chain
      .then(function () {
        progress(form, total, total)
        var url = new URL(last.url)
        if (url.searchParams.get('ok') === 'pridane') url.searchParams.set('n', String(total))
        location.assign(url.toString())
      })
      .catch(function (err) {
        if (err && err.html) show(err.html)
        else {
          card.classList.remove('is-busy')
          form.classList.remove('is-busy')
          form.submit()
        }
      })
  }

  function isStatement(form) {
    return /\/banka$/.test(form.getAttribute('action') || '')
  }

  ready(function () {
    // A file is sent as soon as it is picked. Listened for on the whole page, so that a part of it that is
    // fetched again (below) still works.
    document.addEventListener('change', function (event) {
      var input = event.target
      if (!input || !input.matches || !input.matches('form[data-upload] input[type=file]')) return
      var form = input.form
      if (!input.files || !input.files.length) return
      if (isStatement(form)) return form.submit()
      send(form, Array.prototype.slice.call(input.files))
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
      if (!form) return
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
