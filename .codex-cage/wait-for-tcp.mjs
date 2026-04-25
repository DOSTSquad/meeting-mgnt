import net from 'node:net'

const [, , host, portValue] = process.argv
const port = Number(portValue)

if (!host || !Number.isInteger(port) || port <= 0) {
  console.error('Usage: node .codex-cage/wait-for-tcp.mjs <host> <port>')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const check = () =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host)

    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.end()
      resolve()
    })
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('timeout'))
    })
  })

for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    await check()
    process.exit(0)
  } catch {
    await sleep(1000)
  }
}

console.error(`Timed out waiting for ${host}:${port}`)
process.exit(1)
