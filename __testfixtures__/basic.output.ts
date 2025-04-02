import { z } from "zod";

// Basic schema definitions
const User = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  tags: z.array(z.string()),
  role: z.union([
    z.literal("admin"),
    z.literal("user"),
    z.literal("guest")
  ])
});

type User = z.infer<typeof User>;

// Using the schemas
function validateUser(data: unknown) {
  const result = User.safeParse(data);
  if (result.success) {
    // data is now typed as User
    console.log(`User ${result.data.name} is ${result.data.age} years old`);
    return true;
  }
  return false;
}

function processUser(rawData: unknown) {
  try {
    const user = User.parse(rawData);
    console.log(`Validated user: ${user.name}`);
    return user;
  } catch (error) {
    console.error("Validation failed:", error);
    return null;
  }
}

export { User, validateUser, processUser };