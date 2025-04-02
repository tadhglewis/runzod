// JavaScript cast functions - these should NOT be transformed
function parseData(input: string) {
  // These are JavaScript conversions, not runtypes
  const num = Number(input);
  const str = String(123);
  const bool = Boolean(0);

  return { num, str, bool };
}

// Import with namespace alias
import z from "zod";

// Using namespace imports
const UserSchema = z.object({
  id: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  tags: z.array(z.string()),
  profile: z.object({
    bio: z.string(),
    settings: z.record(z.string(), z.boolean()),
  }),
  role: z.union([z.literal("admin"), z.literal("user")]),
  coordinates: z.tuple([z.number(), z.number()]),
});

// With optional fields
const FormSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
});
