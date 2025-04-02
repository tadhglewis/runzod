import z from "zod";

export const Test = z.object({ a: z.string() });
export type Test = z.infer<typeof Test>;
