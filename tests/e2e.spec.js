/* @vitest-environment node */
import { spawn } from 'child_process'
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function waitForServer(proc, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), timeout)
    proc.stdout.on('data', (b) => {
      const s = b.toString()
      if (s.includes('API server listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

describe('end-to-end server harness', () => {
  it('starts server, runs two scripts via SSE stream, and writes logs/output', async () => {
    // clean output directory for idempotence
    const outDir = path.resolve(ROOT, 'output')
    try {
      if (fs.existsSync(outDir)) {
        for (const f of fs.readdirSync(outDir)) {
          const p = path.join(outDir, f)
          try { fs.rmSync(p, { recursive: true, force: true }) } catch (e) {}
        }
      } else {
        fs.mkdirSync(outDir, { recursive: true })
      }
    } catch (e) {
      // proceed even if cleanup fails
    }

    // spawn the server
    const port = 4100
    const env = { ...process.env, PORT: String(port), HEADLESS: '1' }
    const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })

    try {
      await waitForServer(proc, 5000)
    } catch (e) {
      proc.kill()
      throw e
    }

    // perform fetch to the SSE endpoint and stream two small scripts
    const url = `http://127.0.0.1:${port}/api/stream-execute?files=1preliminary.py,2AccountsReceivable.py`
    const events = []

    const res = await fetch(url)
    if (!res.ok) throw new Error('stream request failed: ' + res.status)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let done = false
    while (!done) {
      const { value, done: d } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })
      // parse any full SSE event chunks separated by \n\n
      while (buf.includes('\n\n')) {
        const chunk = buf.slice(0, buf.indexOf('\n\n'))
        buf = buf.slice(buf.indexOf('\n\n') + 2)
        const lines = chunk.split('\n')
        let ev = { raw: chunk }
        for (const L of lines) {
          if (L.startsWith('data: ')) {
            const payload = L.slice(6)
            try { ev.data = JSON.parse(payload) } catch (e) { ev.data = payload }
          } else if (L.startsWith('event: ')) {
            ev.event = L.slice(7)
          }
        }
        events.push(ev)
        if (ev.event === 'end' || (ev.data && ev.data === 'done')) { done = true }
      }
      if (d) break
    }

    // close fetch reader
    try { reader.releaseLock && reader.releaseLock() } catch (e) {}

    // Validate logs file exists
    const logsFile = path.resolve(ROOT, 'output', 'logs.json')
    expect(fs.existsSync(logsFile)).toBe(true)
    const logs = JSON.parse(fs.readFileSync(logsFile, 'utf8') || '[]')
    expect(Array.isArray(logs)).toBe(true)
    // Ensure the latest log contains the two files
    const last = logs[logs.length - 1]
    expect(last).toBeDefined()
    expect(Array.isArray(last.files)).toBe(true)
    expect(last.files).toEqual(expect.arrayContaining(['1preliminary.py','2AccountsReceivable.py']))

    // check at least one output file created for the first script
    const out1 = path.resolve(ROOT, 'output', '1preliminary.json')
    expect(fs.existsSync(out1)).toBe(true)

    // cleanup
    proc.kill()
  }, 30000)
})
