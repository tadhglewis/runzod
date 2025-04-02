import z from 'zod'

export const Test = z.record({})
export type Test = z.infer<typeof Test>