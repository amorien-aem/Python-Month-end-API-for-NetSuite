<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

defineProps({
  msg: String,
})

const count = ref(0)
const loading = ref(false)
const output = ref('')
let es = null

const scripts = ref([])
const checked = ref({})
const apiKey = ref(localStorage.getItem('api_key') || '')
const logs = ref([])
const outputs = ref([])
const status = ref({})
const showConfirm = ref(false)
const confirmBtn = ref(null)
const lastFocused = ref(null)

watch(showConfirm, async (v) => {
  if (v) {
    await nextTick()
    // save last focused element to restore later
    lastFocused.value = document.activeElement
    // focus the confirm button (primary action)
    if (confirmBtn.value && confirmBtn.value.focus) confirmBtn.value.focus()
  }
})

onBeforeUnmount(() => {
  // if component unmounts with modal open, restore focus
  if (lastFocused.value && lastFocused.value.focus) lastFocused.value.focus()
})

function onModalKeydown(e) {
  if (!showConfirm.value) return
  if (e.key === 'Escape') {
    showConfirm.value = false
    // restore focus
    if (lastFocused.value && lastFocused.value.focus) lastFocused.value.focus()
  } else if (e.key === 'Enter') {
    startExecution()
  }
}

function onModalKeydownTrap(e) {
  // trap Tab / Shift+Tab within the modal
  if (e.key !== 'Tab') return
  const container = e.currentTarget
  // query all focusable children inside the overlay (which contains the modal)
  const focusable = Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.hasAttribute('disabled'))
  if (!focusable.length) return
  const active = document.activeElement
  let idx = focusable.indexOf(active)
  if (idx === -1) idx = 0
  const n = focusable.length
  const next = e.shiftKey ? (idx - 1 + n) % n : (idx + 1) % n
  e.preventDefault()
  // mark that trap ran (helps tests detect handler execution)
  try { container.setAttribute('data-trapped', 'true') } catch (e) {}
  focusable[next].focus()
}
const logPreview = ref({})
function saveApiKey() {
  localStorage.setItem('api_key', apiKey.value)
}

async function loadLogs() {
  const q = apiKey.value ? `?api_key=${encodeURIComponent(apiKey.value)}` : ''
  try {
    const r = await fetch(`/api/logs${q}`)
    const j = await r.json()
    logs.value = j.logs || []
  } catch (e) {
    logs.value = []
  }
  try {
    const ro = await fetch(`/api/output${q}`)
    const jo = await ro.json()
    outputs.value = jo.files || []
  } catch (e) {
    outputs.value = []
  }
}

async function loadScripts() {
  try {
    const r = await fetch('/api/scripts')
    const j = await r.json()
    scripts.value = j.scripts || []
    for (const s of scripts.value) checked.value[s] = false
  } catch (e) {
    scripts.value = []
  }
}

// load scripts on setup
loadScripts()
function executeMonthEnd() {
  // open confirm modal
  const allChecked = scripts.value.every(s => checked.value[s])
  if (!allChecked) {
    alert('Please check all scripts before executing.')
    return
  }
  showConfirm.value = true
}

function startExecution() {
  showConfirm.value = false
  if (es) return
  const filesParam = scripts.value.join(',')
  const q = apiKey.value ? `&api_key=${encodeURIComponent(apiKey.value)}` : ''
  loading.value = true
  output.value = ''
  // set running status
  for (const s of scripts.value) status.value[s] = 'running'
  es = new EventSource(`/api/stream-execute?files=${encodeURIComponent(filesParam)}${q}`)

  function appendOutput(text, kind='stdout') {
    if (kind === 'stderr') {
      output.value += '[stderr] ' + text
    } else {
      output.value += text
    }
    setTimeout(() => {
      const pre = document.querySelector('pre')
      if (pre) pre.scrollTop = pre.scrollHeight
    }, 0)
  }

  es.addEventListener('message', (ev) => {
    try {
      const obj = JSON.parse(ev.data)
      if (obj.type === 'stdout' || obj.type === 'stderr') {
        if (obj.file) {
          status.value[obj.file] = obj.type === 'stderr' ? 'error' : 'ok'
        }
        appendOutput(obj.data, obj.type)
      } else if (obj.type === 'json') {
        appendOutput(JSON.stringify(obj.data, null, 2) + '\n')
      } else if (obj.type === 'exit') {
        appendOutput(`[exit ${obj.code}] for ${obj.file}\n`)
        if (obj.file) status.value[obj.file] = obj.code === 0 ? 'ok' : 'error'
      } else {
        appendOutput(ev.data + '\n')
      }
    } catch (e) {
      appendOutput(ev.data + '\n')
    }
  })

  es.addEventListener('end', async () => {
    loading.value = false
    if (es) { es.close(); es = null }
    await loadLogs()
    // automatically open the most recent log and fetch previews for its files
    if (logs.value && logs.value.length) {
      const last = logs.value[logs.value.length - 1]
      last.show = true
      // fetch preview for each file in results (non-blocking)
      if (Array.isArray(last.results)) {
        for (const r of last.results) {
          // small delay to avoid overwhelming the server
          fetchPreview(r.file)
        }
      }
      // refresh outputs list once more to include newly created files
      try {
        const ro = await fetch(`/api/output${q}`)
        const jo = await ro.json()
        outputs.value = jo.files || []
      } catch (e) {
        // ignore
      }
    }
    for (const s of scripts.value) if (status.value[s] === 'running') status.value[s] = 'pending'
  })

  es.onerror = (err) => {
    appendOutput('\n[stream error] ' + (err && err.message ? err.message : '') + '\n', 'stderr')
    loading.value = false
    if (es) { es.close(); es = null }
  }
}

async function fetchPreview(filename) {
  if (logPreview.value[filename]) return
  try {
    const q = apiKey.value ? `?api_key=${encodeURIComponent(apiKey.value)}` : ''
    const r = await fetch(`/api/output/file?name=${encodeURIComponent(filename)}${q}`)
    if (!r.ok) {
      logPreview.value[filename] = `Error: ${r.status} ${r.statusText}`
      return
    }
    const txt = await r.text()
    // limit preview size
    logPreview.value[filename] = txt.slice(0, 2000)
  } catch (e) {
    logPreview.value[filename] = `Fetch error: ${e.message}`
  }
}
</script>

<template>
  <h1>{{ msg }}</h1>

  <div class="card">
    <h2>Scripts</h2>
    <ul>
      <li v-for="s in scripts" :key="s">
        <input type="checkbox" v-model="checked[s]" :disabled="loading" />
        <strong>{{ s }}</strong>
        <span class="badge" :class="status[s] || ''">
          <template v-if="status[s] === 'running'"><span class="spinner" aria-hidden></span></template>
          <template v-else>{{ status[s] || 'pending' }}</template>
        </span>
        <a :href="`/view-script?name=${encodeURIComponent(s)}`" target="_blank" rel="noopener">Open</a>
      </li>
    </ul>
    <button type="button" @click="executeMonthEnd" :disabled="loading">{{ loading ? 'Executing...' : 'Execute month end program' }}</button>
    <!-- Confirm modal -->
    <transition name="modal-fade">
      <div v-if="showConfirm" class="modal-overlay" @keydown.self.prevent="onModalKeydown" @keydown.capture="onModalKeydownTrap" tabindex="-1">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Confirm execution">
          <h3>Confirm execution</h3>
          <p>Execute these scripts?</p>
          <ul>
            <li v-for="s in scripts" :key="s">{{ s }}</li>
          </ul>
          <div class="modal-actions">
            <button data-test="cancel" @click="showConfirm = false">Cancel</button>
            <button data-test="confirm" ref="confirmBtn" @click="startExecution">Confirm</button>
          </div>
        </div>
      </div>
    </transition>
    <p>
      <code>components/HelloWorld.vue</code> to test.  Powered by AEM.
    </p>
  </div>

  <div class="card">
    <h2>Settings</h2>
    <label>API Key: <input v-model="apiKey" /><button @click="saveApiKey">Save</button></label>
    <button @click="loadLogs">Refresh Logs</button>
  </div>

  <div class="card">
    <h2>Logs</h2>
    <ul>
      <li v-for="log in logs" :key="log.timestamp">
        <strong>{{ log.timestamp }}</strong>
        <div>Files: {{ log.files.join(', ') }}</div>
        <div>Results: <span v-for="r in log.results" :key="r.file">{{ r.file }}={{ r.exit }} </span></div>
        <div>
          <button @click="log.show = !log.show">{{ log.show ? 'Hide' : 'Show' }} details</button>
        </div>
        <div v-if="log.show">
          <ul>
            <li v-for="r in log.results" :key="r.file">
              {{ r.file }} - exit {{ r.exit }}
              <a :href="`/api/output/file?name=${encodeURIComponent(r.file)}${apiKey ? '&api_key='+encodeURIComponent(apiKey) : ''}`" target="_blank">Download</a>
              <button @click="fetchPreview(r.file)">Preview</button>
              <pre v-if="logPreview[r.file]">{{ logPreview[r.file] }}</pre>
            </li>
          </ul>
        </div>
      </li>
    </ul>
    <h3>Output files</h3>
    <ul>
      <li v-for="f in outputs" :key="f"><a :href="`/api/output/file?name=${encodeURIComponent(f)}${apiKey ? '&api_key='+encodeURIComponent(apiKey) : ''}`" target="_blank">{{ f }}</a></li>
    </ul>
  </div>

  <div v-if="output">
    <h3>Output</h3>
    <pre>
      <code>
        <template v-for="(line, i) in output.split('\n')" :key="i">
          <span :class="line.startsWith('[stderr]') ? 'stderr' : 'stdout'">{{ line }}\n</span>
        </template>
      </code>
    </pre>
  </div>

  <p>
    Check out
    <a href="https://vuejs.org/guide/quick-start.html#local" target="_blank"
      >create-vue</a
    >, the official Vue + Vite starter
  </p>
  <p>
    Install
    <a href="https://github.com/vuejs/language-tools" target="_blank">Vue IDE Language Tools</a>
    for best user experience.
  </p>
  <p class="read-the-docs">Click on the Vite and Vue logos to learn about this framework.</p>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}
.badge{ display:inline-block; margin:0 8px; padding:2px 8px; border-radius:12px; font-size:0.8em }
.badge.ok{ background:#dff0d8; color:#28692c }
.badge.error{ background:#f8d7da; color:#7a0b0b }
.stdout{ color:#111 }
.stderr{ color:#b30000; font-weight:600 }
.modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center }
.modal{ background:#fff; padding:16px; border-radius:8px; width:90%; max-width:520px }
.modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 200ms ease, transform 200ms ease }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.95) }
.modal-fade-enter-to, .modal-fade-leave-from { opacity: 1; transform: scale(1) }
.badge.running { animation: pulse 1s infinite; }
@keyframes pulse { 0% { transform: translateY(0) scale(1) } 50% { transform: translateY(-2px) scale(1.02) } 100% { transform: translateY(0) scale(1) } }
.spinner{ display:inline-block; width:14px; height:14px; border-radius:50%; border:2px solid rgba(0,0,0,0.15); border-top-color:#333; animation: spin 0.8s linear infinite; vertical-align:middle }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
