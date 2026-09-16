import { Router } from 'express'

import { list, remove, update } from '../controllers/user-controller.js'

const userRouter = Router()

userRouter.get('/', list)
userRouter.put('/:id', update)
userRouter.delete('/:id', remove)

export default userRouter
