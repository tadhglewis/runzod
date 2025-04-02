import * as t from "runtypes";

// Array of Records - this should transform to z.array(z.object({...}))
const UsersSchema = t.Array(
  t.Record({
    id: t.String,
    name: t.String,
    age: t.Number,
    isActive: t.Boolean
  })
);

// Regular Record - this should transform to z.object({...})
const UserSchema = t.Record({
  id: t.String,
  name: t.String,
  age: t.Number,
  isActive: t.Boolean
});

// Dictionary Record - this should transform to z.record(z.string(), z.number())
const DictSchema = t.Record(t.String, t.Number);