import * as t from "runtypes";

export const Test = t.Object({ a: t.String });
export type Test = t.Static<typeof Test>;
