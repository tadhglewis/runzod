import z from "zod";

// Array of Records - this should transform to z.array(z.object({...}))
const UsersSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    isActive: z.boolean()
  })
);

// Regular Record - this should transform to z.object({...})
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
  isActive: z.boolean()
});

// Dictionary Record - this should transform to z.record(z.string(), z.number())
const DictSchema = z.record(z.string(), z.number());