import express from 'express'
import { execFile } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())

// Serve static files from the project's `public` directory (and fall back to repo root index.html)
const publicDir = path.resolve(__dirname, '..', 'public')
const repoIndex = path.resolve(__dirname, '..', 'index.html')
if (fs.existsSync(publicDir)) app.use(express.static(publicDir))

// Respond to GET / with the repo's index.html if it exists (helps Codespaces/GitHub.dev URLs)
app.get('/', (req, res) => {
  console.log('GET / requested')
  console.log('repoIndex', repoIndex, 'exists?', fs.existsSync(repoIndex))
  const alt = path.join(publicDir, 'index.html')
  console.log('public/index.html', alt, 'exists?', fs.existsSync(alt))
  if (fs.existsSync(repoIndex)) return res.sendFile(repoIndex)
  if (fs.existsSync(alt)) return res.sendFile(alt)
  res.send('API server is running. Use /api/* endpoints.')
})

// Simple API key middleware (use API_KEY env var)
app.use((req, res, next) => {
  const key = process.env.API_KEY
  if (!key) return next()
  const provided = req.get('x-api-key') || req.query.api_key
  if (provided === key) return next()
  res.status(401).send('Unauthorized')
})

// Return the list of available script filenames (relative to repo root)
app.get('/api/scripts', (req, res) => {
  const scripts = [
    '1preliminary.py',
    '2AccountsReceivable.py',
    '3AccountsPayable.py',
    '4BankReconciliation.py',
    '5Inventory.py',
    '6AccrualsAdjustments.py',
    '7ReviewFinancials.py',
    '8LockClosePeriod.py',
  ]
  res.json({ scripts })
})

// Return the raw content of a script; use ?name=filename
app.get('/api/script', (req, res) => {
  const name = req.query.name
  if (!name) return res.status(400).send('missing name')
  const filePath = path.resolve(__dirname, '..', name)
  res.sendFile(filePath)
})

// HTML viewer for a script (safe subset) - ?name=filename
app.get('/view-script', (req, res) => {
  const name = req.query.name
  if (!name) return res.status(400).send('missing name')
  const filePath = path.resolve(__dirname, '..', name)
  const content = fs.readFileSync(filePath, 'utf8')
  // escape HTML chars
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${name}</title><link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css" rel="stylesheet"/></head><body><pre><code class="language-python">${escaped}</code></pre><script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script></body></html>`)
})

// Return run logs
app.get('/api/logs', (req, res) => {
  const logsFile = path.resolve(__dirname, '..', 'output', 'logs.json')
  if (!fs.existsSync(logsFile)) return res.json({ logs: [] })
  const data = JSON.parse(fs.readFileSync(logsFile, 'utf8') || '[]')
  res.json({ logs: data })
})

// List files in output/
app.get('/api/output', (req, res) => {
  const dir = path.resolve(__dirname, '..', 'output')
  if (!fs.existsSync(dir)) return res.json({ files: [] })
  const files = fs.readdirSync(dir)
  res.json({ files })
})

// Serve a file from output/ by name
app.get('/api/output/file', (req, res) => {
  const name = req.query.name
  if (!name) return res.status(400).send('missing name')
  const filePath = path.resolve(__dirname, '..', 'output', name)
  if (!fs.existsSync(filePath)) return res.status(404).send('not found')
  res.sendFile(filePath)
})

// POST /api/execute -> runs the Python month-end script and returns output
app.post('/api/execute', (req, res) => {
  const scriptPath = path.resolve(__dirname, '..', '00Execute month end program00.py')
  const py = 'python3'

  // ensure child scripts run in headless mode (no Tk display)
  const child = execFile(py, [scriptPath], { env: { ...process.env, HEADLESS: '1' }, timeout: 1000 * 60 * 5 }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ success: false, error: error.message, stdout, stderr })
    }
    res.json({ success: true, stdout, stderr })
  })
});

// Server-Sent Events endpoint for streaming execution output in real-time
app.get('/api/stream-execute', (req, res) => {
  const scriptPath = path.resolve(__dirname, '..', '00Execute month end program00.py')
  const py = 'python3'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders && res.flushHeaders()

  // If ?files=a,b,c provided, run those scripts sequentially; otherwise run the full orchestrator
  const filesQuery = req.query.files

  const send = (type, data) => {
    const payload = JSON.stringify({ type, data })
    res.write(`data: ${payload}\n\n`)
  }

  const runScript = (scriptFile) => {
    return new Promise((resolve) => {
      const scriptFull = path.resolve(__dirname, '..', scriptFile)
      const p = spawn(py, [scriptFull], { env: { ...process.env, HEADLESS: '1' } })
      p.stdout.on('data', chunk => send('stdout', chunk.toString()))
      p.stderr.on('data', chunk => send('stderr', chunk.toString()))
      p.on('close', code => resolve(code))
    })
  }

  const logsFile = path.resolve(__dirname, '..', 'output', 'logs.json')

  const appendLog = (entry) => {
    try {
      fs.mkdirSync(path.dirname(logsFile), { recursive: true })
      let arr = []
      if (fs.existsSync(logsFile)) arr = JSON.parse(fs.readFileSync(logsFile, 'utf8') || '[]')
      arr.push(entry)
      fs.writeFileSync(logsFile, JSON.stringify(arr, null, 2))
    } catch (e) {
      console.error('failed to append log', e)
    }
  }

  (async () => {
    if (filesQuery) {
      const files = filesQuery.split(',')
      const results = []
      for (const f of files) {
        const code = await runScript(f)
        results.push({ file: f, exit: code })
        send('exit', String(code))
      }
      const logEntry = { timestamp: new Date().toISOString(), files, results }
      appendLog(logEntry)
      res.write('event: end\n')
      res.write('data: done\n\n')
      res.end()
      return
    }

    // default: run the orchestrator script
    const proc = spawn(py, [scriptPath], { env: { ...process.env, HEADLESS: '1' } })
    proc.stdout.on('data', chunk => send('stdout', chunk.toString()))
    proc.stderr.on('data', chunk => send('stderr', chunk.toString()))
    proc.on('close', code => {
      send('exit', String(code))
      // log orchestrator run
      appendLog({ timestamp: new Date().toISOString(), orchestrator: true, exit: code })
      res.write('event: end\n')
      res.write('data: done\n\n')
      res.end()
    })
    req.on('close', () => { if (!proc.killed) proc.kill() })
  })()
})
// optional: stream stdout/stderr back (not implemented for simplicity)

const port = process.env.PORT || 3000
// bind to 0.0.0.0 so ports are reachable from the host/container environment
app.listen(port, '0.0.0.0', () => console.log(`API server listening on http://0.0.0.0:${port}`))
