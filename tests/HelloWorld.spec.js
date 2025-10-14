import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HelloWorld from '../src/components/HelloWorld.vue'
import { describe, it, expect, vi } from 'vitest'

// Removed manual JSDOM setup, using vitest globals instead

class FakeES {
  constructor(url) { this.url = url; this.listeners = {} }
  addEventListener(ev, cb) { this.listeners[ev] = cb }
  close() {}
}

const waitFor = async (predicate, timeout = 500) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return true
    await new Promise(r => setTimeout(r, 20))
  }
  return false
}

describe('HelloWorld modal and keyboard', () => {
  it('opens modal, cancels with Escape, confirms with Enter', async () => {
    global.fetch = vi.fn((url) => {
      if (url.endsWith('/api/scripts')) return Promise.resolve({ json: () => Promise.resolve({ scripts: ['a.py','b.py'] }) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') })
    })
    const wrapper = mount(HelloWorld, { props: { msg: 'Test' } })

    // wait for scripts to load
    await new Promise(r => setTimeout(r, 0))

    // check all checkboxes
    const boxes = wrapper.findAll('input[type=checkbox]')
    for (const b of boxes) await b.setChecked()

    // click execute -> modal shown
    await wrapper.find('button').trigger('click')
    expect(wrapper.html()).toContain('Confirm execution')

    // press Escape -> modal closed
    await wrapper.find('.modal-overlay').trigger('keydown', { key: 'Escape' })
    expect(wrapper.html()).not.toContain('Confirm execution')

    // reopen and press Enter to confirm
    await wrapper.find('button').trigger('click')
    global.EventSource = FakeES
    await wrapper.find('.modal-overlay').trigger('keydown', { key: 'Enter' })
    // modal should close
    expect(wrapper.html()).not.toContain('Confirm execution')
  })

  it('SSE parsing updates output and per-script status', async () => {
    global.fetch = vi.fn((url) => {
      if (url.endsWith('/api/scripts')) return Promise.resolve({ json: () => Promise.resolve({ scripts: ['1preliminary.py','2AccountsReceivable.py'] }) })
      if (url.includes('/api/logs')) return Promise.resolve({ json: () => Promise.resolve({ logs: [] }) })
      if (url.includes('/api/output')) return Promise.resolve({ json: () => Promise.resolve({ files: [] }) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) })
    })

    // fake EventSource that emits events after construction
    class EmittingES {
      constructor(url) {
        this.url = url
        this.listeners = {}
        // emit a small sequence after a tick
        setTimeout(() => {
          const message = (data) => this.listeners['message'] && this.listeners['message']({ data: JSON.stringify(data) })
          this.listeners['message'] && message({ type: 'stdout', data: 'Starting 1preliminary\n', file: '1preliminary.py' })
          this.listeners['message'] && message({ type: 'exit', code: 0, file: '1preliminary.py' })
          this.listeners['message'] && message({ type: 'stderr', data: 'Warning from 2Accounts\n', file: '2AccountsReceivable.py' })
          this.listeners['message'] && message({ type: 'exit', code: 1, file: '2AccountsReceivable.py' })
          // final end
          this.listeners['end'] && this.listeners['end']()
          }, 20)
      }
      addEventListener(ev, cb) { this.listeners[ev] = cb }
      close() {}
    }

    global.EventSource = EmittingES
    const wrapper = mount(HelloWorld, { props: { msg: 'Test' } })
    await new Promise(r => setTimeout(r, 0))
    // check all boxes
    const boxes = wrapper.findAll('input[type=checkbox]')
    for (const b of boxes) await b.setChecked()
    // open modal and confirm
    await wrapper.find('button').trigger('click')
    await wrapper.find('.modal-overlay').trigger('keydown', { key: 'Enter' })
    // wait for ES emissions
    await new Promise(r => setTimeout(r, 50))
    // output should contain starting line and warning
    expect(wrapper.html()).toContain('Starting 1preliminary')
    expect(wrapper.html()).toContain('Warning from 2Accounts')
    // check component vm status for files
    const waitForStatus = async (timeout = 500) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const st = wrapper.vm.status || {}
        if (st['2AccountsReceivable.py'] === 'error') return true
        await new Promise(r => setTimeout(r, 20))
      }
      return false
    }
    const statusOk = await waitForStatus(1000)
    expect(statusOk).toBe(true)
  })

  it('handles JSON-typed SSE messages', async () => {
    global.fetch = vi.fn((url) => {
      if (url.endsWith('/api/scripts')) return Promise.resolve({ json: () => Promise.resolve({ scripts: ['a.py'] }) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) })
    })

    class JsonES {
      constructor() {
        this.listeners = {}
        setTimeout(() => {
          this.listeners['message'] && this.listeners['message']({ data: JSON.stringify({ type: 'json', data: { summary: 'done' } }) })
          this.listeners['end'] && this.listeners['end']()
        }, 0)
      }
      addEventListener(ev, cb) { this.listeners[ev] = cb }
      close() {}
    }

  global.EventSource = JsonES
  const wrapper = mount(HelloWorld, { props: { msg: 'Test' } })
  await waitFor(() => wrapper.findAll('input[type=checkbox]').length > 0, 500)
  // check checkbox
  const box = wrapper.find('input[type=checkbox]')
  await box.setChecked()
    // open modal and confirm
    await wrapper.find('button').trigger('click')
    await wrapper.find('.modal-overlay').trigger('keydown', { key: 'Enter' })
    // wait for JSON emission
    await new Promise(r => setTimeout(r, 50))
    expect(wrapper.html()).toContain('summary')
  })

  it('handles EventSource errors and clears loading', async () => {
    global.fetch = vi.fn((url) => {
      if (url.endsWith('/api/scripts')) return Promise.resolve({ json: () => Promise.resolve({ scripts: ['a.py'] }) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) })
    })

    class ErrES {
      constructor() { this.listeners = {} }
      addEventListener(ev, cb) { this.listeners[ev] = cb }
      close() {}
    }

    // EventSource will be created but we call onerror later
    class ErrES2 {
      constructor() { this.listeners = {}; global._lastES = this }
      addEventListener(ev, cb) { this.listeners[ev] = cb }
      close() {}
    }
    global.EventSource = ErrES2
    const wrapper = mount(HelloWorld, { props: { msg: 'Test' } })
    await waitFor(() => wrapper.findAll('input[type=checkbox]').length > 0, 500)
    const box = wrapper.find('input[type=checkbox]')
    await box.setChecked()
    // open modal and confirm
    await wrapper.find('button').trigger('click')
    await wrapper.find('.modal-overlay').trigger('keydown', { key: 'Enter' })
    // simulate an error by calling the onerror handler from the instance
    // find the real EventSource instance created on window
    // call the onerror handler on the last created ES instance
    const instance = global._lastES
    if (instance && instance.onerror) instance.onerror(new Error('test error'))
    // wait a tick
    await new Promise(r => setTimeout(r, 20))
    expect(wrapper.vm.loading).toBe(false)
  })

  it('handles chunked/partial SSE payloads (concatenation)', async () => {
    global.fetch = vi.fn((url) => {
      if (url.endsWith('/api/scripts')) return Promise.resolve({ json: () => Promise.resolve({ scripts: ['chunked.py'] }) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) })
    })

    class ChunkedES {
      constructor() {
        this.listeners = {}
        setTimeout(() => {
          // simulate several message events that together form two lines
          this.listeners['message'] && this.listeners['message']({ data: JSON.stringify({ type: 'stdout', data: 'Part1 of line ' }) })
          this.listeners['message'] && this.listeners['message']({ data: JSON.stringify({ type: 'stdout', data: 'continued\nSecond line start ' }) })
          this.listeners['message'] && this.listeners['message']({ data: JSON.stringify({ type: 'stdout', data: 'and end\n' }) })
          this.listeners['end'] && this.listeners['end']()
        }, 0)
      }
      addEventListener(ev, cb) { this.listeners[ev] = cb }
      close() {}
    }

    global.EventSource = ChunkedES
    const wrapper = mount(HelloWorld, { props: { msg: 'Test' } })
    await new Promise(r => setTimeout(r, 0))
    await waitFor(() => wrapper.findAll('input[type=checkbox]').length > 0, 500)
    const box = wrapper.find('input[type=checkbox]')
    await box.setChecked()
    await wrapper.find('button').trigger('click')
    await wrapper.find('.modal-overlay').trigger('keydown', { key: 'Enter' })
    await new Promise(r => setTimeout(r, 50))
    // joined output should contain both lines correctly
    const out = wrapper.vm.output || ''
    expect(out).toContain('Part1 of line continued')
    expect(out).toContain('Second line start and end')
  })

  it('traps focus inside the confirm modal with Tab and Shift+Tab', async () => {
    global.fetch = vi.fn((url) => {
      if (url.endsWith('/api/scripts')) return Promise.resolve({ json: () => Promise.resolve({ scripts: ['a.py'] }) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok'), json: () => Promise.resolve({}) })
    })

    const wrapper = mount(HelloWorld, { props: { msg: 'Test' } })
    await new Promise(r => setTimeout(r, 0))
    await waitFor(() => wrapper.findAll('input[type=checkbox]').length > 0, 500)
    const box = wrapper.find('input[type=checkbox]')
    await box.setChecked()
    await wrapper.find('button').trigger('click')
    // modal should be visible
    await waitFor(() => wrapper.find('.modal-overlay').exists(), 500)
    const cancel = wrapper.find('button[data-test="cancel"]')
    const confirm = wrapper.find('button[data-test="confirm"]')
    // initial focus should be on confirm
    await waitFor(() => document.activeElement === confirm.element, 200)

  // press Tab -> dispatch on the overlay so the capture handler handles it
  const overlay = wrapper.find('.modal-overlay').element
  overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  await waitFor(() => overlay.getAttribute('data-trapped') === 'true', 200)
  expect(overlay.getAttribute('data-trapped')).toBe('true')

  // simulate Shift+Tab -> dispatch on overlay
  overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
  await waitFor(() => overlay.getAttribute('data-trapped') === 'true', 200)
  expect(overlay.getAttribute('data-trapped')).toBe('true')
  })
})
