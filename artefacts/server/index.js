import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 3001
const app = createApp()

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
