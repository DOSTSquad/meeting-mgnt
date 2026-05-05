import { Router } from 'express'

import { list } from '../controllers/user-controller.js'

const userRouter = Router()

userRouter.get('/', list)

export default userRouter
