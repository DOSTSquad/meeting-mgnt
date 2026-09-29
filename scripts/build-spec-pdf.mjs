// Builds the client-facing technical specification PDF from the Markdown source.
// Usage: node scripts/build-spec-pdf.mjs   (needs Chrome; set CHROME_PATH to override)
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(rootDir, 'artefacts/docs/technical-spec.md')
const outputPaths = [
  path.join(rootDir, 'docs/technical-spec.pdf'),
  path.join(rootDir, 'artefacts/docs/technical-spec.pdf'),
]
const chromePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const LIBRARIES = {
  'marked.js': 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'mermaid.js': 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js',
}

const STYLES = `
@page {
  size: A4;
  margin: 18mm 16mm 20mm;
  @bottom-left { content: 'DOST Meeting Management Technical Specification'; font: 8pt -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #64748b; }
  @bottom-right { content: counter(page) ' / ' counter(pages); font: 8pt -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #64748b; }
}
@page wide {
  size: A4 landscape;
  margin: 14mm 14mm 18mm;
  @bottom-left { content: 'DOST Meeting Management Technical Specification'; font: 8pt -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #64748b; }
  @bottom-right { content: counter(page) ' / ' counter(pages); font: 8pt -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #64748b; }
}
.wide-page { page: wide; }
.wide-page .mermaid svg { max-height: 158mm; }
.mermaid.compact svg { max-height: 100mm; }
.mermaid.er svg { max-height: 82mm; }
.mermaid.er.tall svg { max-height: 118mm; }
p:has(+ table), p:has(+ .mermaid) { break-after: avoid; }
* { box-sizing: border-box; }
body { font: 10pt/1.5 -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 24pt; margin: 0 0 4pt; color: #0f172a; }
h1 + p { color: #64748b; margin: 0 0 14pt; }
h2 { font-size: 15pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 1.5px solid #cbd5e1; break-after: avoid; }
h3 { font-size: 12pt; margin: 16pt 0 6pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
ul, ol { padding-left: 18pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 8.5pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f1f5f9; }
table.api td:nth-child(1) { width: 52pt; }
table.api td:nth-child(2) { width: 55%; }
code { font: 8.5pt ui-monospace, Menlo, monospace; background: #f1f5f9; padding: 0 3pt; border-radius: 3pt; overflow-wrap: break-word; }
.mermaid { text-align: center; margin: 10pt 0 14pt; break-inside: avoid; }
.mermaid svg { max-width: 100%; height: auto; max-height: 225mm; }
.toc { margin: 10pt 0 0; padding: 10pt 14pt; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6pt; break-inside: avoid; }
.toc-title { font-weight: 700; margin-bottom: 4pt; }
.toc ol { margin: 0; columns: 2; column-gap: 24pt; list-style: none; padding: 0; }
.toc li { margin: 1pt 0; }
.toc a { color: inherit; text-decoration: none; }
`

const PAGE_SCRIPT = `
const WIDE_DIAGRAM = /^\\s*(sequenceDiagram)/

const moveWideDiagramToOwnPage = (diagram) => {
  if (!WIDE_DIAGRAM.test(diagram.textContent)) {
    return
  }

  const wrapper = document.createElement('section')
  wrapper.className = 'wide-page'
  let first = diagram

  if (first.previousElementSibling?.tagName === 'H3') {
    first = first.previousElementSibling
  }

  const stop = diagram.nextElementSibling
  first.before(wrapper)

  while (wrapper.nextElementSibling !== stop) {
    wrapper.append(wrapper.nextElementSibling)
  }
}

const buildToc = (root) => {
  const headings = [...root.querySelectorAll('h2')]
  headings.forEach((heading, index) => { heading.id = 'section-' + (index + 1) })
  const toc = document.createElement('nav')
  toc.className = 'toc'
  toc.innerHTML =
    '<div class="toc-title">Contents</div><ol>' +
    headings.map((h) => '<li><a href="#' + h.id + '">' + h.textContent + '</a></li>').join('') +
    '</ol>'
  const subtitle = root.querySelector('h1 + p')
  ;(subtitle || root.querySelector('h1')).after(toc)
}

const start = async () => {
  const root = document.getElementById('content')
  root.innerHTML = marked.parse(MARKDOWN, { gfm: true })

  root.querySelectorAll('pre > code.language-mermaid').forEach((code) => {
    const diagram = document.createElement('div')
    diagram.className = 'mermaid'
    diagram.textContent = code.textContent
    diagram.classList.toggle('compact', /^\\s*flowchart/.test(code.textContent))
    diagram.classList.toggle('er', /^\\s*erDiagram/.test(code.textContent))
    diagram.classList.toggle('tall', /%%\\s*tall/.test(code.textContent))
    code.parentElement.replaceWith(diagram)
  })

  root.querySelectorAll('table').forEach((table) => {
    const headers = [...table.querySelectorAll('th')].map((th) => th.textContent)
    if (headers[0] === 'Method' && headers[1] === 'Path') {
      table.classList.add('api')
    }
  })

  root.querySelectorAll('.mermaid').forEach(moveWideDiagramToOwnPage)

  buildToc(root)
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict',
    themeVariables: {
      fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
      fontSize: '15px',
      primaryColor: '#dbeafe',
      primaryBorderColor: '#2563eb',
      primaryTextColor: '#0f172a',
      secondaryColor: '#f1f5f9',
      tertiaryColor: '#f8fafc',
      lineColor: '#64748b',
      textColor: '#0f172a',
      edgeLabelBackground: '#ffffff',
      actorBkg: '#dbeafe',
      actorBorder: '#2563eb',
      actorTextColor: '#0f172a',
      actorLineColor: '#94a3b8',
      signalColor: '#334155',
      signalTextColor: '#0f172a',
      noteBkgColor: '#ffffff',
      noteBorderColor: '#cbd5e1',
      noteTextColor: '#334155',
    },
    flowchart: { curve: 'basis', padding: 14, nodeSpacing: 40, rankSpacing: 50 },
    sequence: {
      wrap: true,
      actorMargin: 20,
      width: 150,
      messageMargin: 26,
      noteMargin: 6,
      boxMargin: 6,
      mirrorActors: false,
      noteAlign: 'left',
    },
    er: { fontSize: 15, minEntityWidth: 120, entityPadding: 12 },
  })
  await mermaid.run({ querySelector: '.mermaid' })
  document.body.dataset.ready = 'true'
}

start().catch((error) => { document.body.dataset.error = String(error) })
`

const download = async (url, destination) => {
  try {
    await stat(destination)
    return
  } catch {
    // not cached yet
  }

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`)
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

const buildHtml = (markdown) => {
  const embedded = JSON.stringify(markdown).replaceAll('</', '<\\/')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DOST Meeting Management Technical Specification</title>
<style>${STYLES}</style>
</head>
<body>
<main id="content"></main>
<script src="marked.js"></script>
<script src="mermaid.js"></script>
<script>const MARKDOWN = ${embedded}\n${PAGE_SCRIPT}</script>
</body>
</html>
`
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const launchChrome = async (workDir) => {
  const profileDir = path.join(workDir, 'chrome-profile')
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0',
    ],
    { stdio: 'ignore' }
  )

  const portFile = path.join(profileDir, 'DevToolsActivePort')

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).split('\n')
      return { chrome, port }
    } catch {
      await sleep(100)
    }
  }

  chrome.kill()
  throw new Error('Chrome did not start')
}

const connect = async (port) => {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const socket = new WebSocket(
    targets.find((target) => target.type === 'page').webSocketDebuggerUrl
  )
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  const pending = new Map()
  let nextId = 0

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    const handlers = pending.get(message.id)

    if (!handlers) {
      return
    }

    pending.delete(message.id)

    if (message.error) {
      handlers.reject(new Error(message.error.message))
      return
    }

    handlers.resolve(message.result)
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1
      pending.set(nextId, { resolve, reject })
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })

  return { send, close: () => socket.close() }
}

const evaluate = async (session, expression) => {
  const { result } = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  })

  return result.value
}

const waitForRender = async (session, expectedDiagrams) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const state = await evaluate(
      session,
      `JSON.stringify({
        ready: document.body.dataset.ready === 'true',
        error: document.body.dataset.error || '',
        diagrams: document.querySelectorAll('.mermaid[data-processed="true"] svg').length,
        syntaxErrors: document.body.innerText.includes('Syntax error in text'),
      })`
    )
    const { ready, error, diagrams, syntaxErrors } = JSON.parse(state)

    if (error) {
      throw new Error(`Page script failed: ${error}`)
    }

    if (ready) {
      if (diagrams !== expectedDiagrams || syntaxErrors) {
        throw new Error(`Expected ${expectedDiagrams} rendered diagrams, got ${diagrams}`)
      }

      return
    }

    await sleep(200)
  }

  throw new Error('Page did not finish rendering within 60 seconds')
}

const renderPdf = async (workDir, expectedDiagrams) => {
  const { chrome, port } = await launchChrome(workDir)

  try {
    const session = await connect(port)
    await session.send('Page.enable')
    await session.send('Page.navigate', { url: `file://${path.join(workDir, 'spec.html')}` })
    await waitForRender(session, expectedDiagrams)

    const { data } = await session.send('Page.printToPDF', {
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    })
    session.close()

    return Buffer.from(data, 'base64')
  } finally {
    chrome.kill()
  }
}

const main = async () => {
  const markdown = await readFile(sourcePath, 'utf8')
  const expectedDiagrams = (markdown.match(/^```mermaid$/gm) ?? []).length

  const cacheDir = path.join(os.tmpdir(), 'dost-spec-pdf-cache')
  await mkdir(cacheDir, { recursive: true })

  const workDir = await mkdtemp(path.join(os.tmpdir(), 'dost-spec-pdf-'))
  for (const [name, url] of Object.entries(LIBRARIES)) {
    await download(url, path.join(cacheDir, name))
    await copyFile(path.join(cacheDir, name), path.join(workDir, name))
  }
  await writeFile(path.join(workDir, 'spec.html'), buildHtml(markdown))

  const pdf = await renderPdf(workDir, expectedDiagrams)

  for (const outputPath of outputPaths) {
    await writeFile(outputPath, pdf)
    console.log(`Wrote ${path.relative(rootDir, outputPath)}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
