import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()

app.use(express.json())
app.use(cors())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
