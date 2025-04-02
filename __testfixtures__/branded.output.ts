import { z } from "zod";

// Branded types example
const UserId = z.string().brand("UserId");
const Email = z.string()
  .refine(s => /\S+@\S+\.\S+/.test(s), "Invalid email format")
  .brand("Email");

const User = z.object({
  id: UserId,
  email: Email,
  role: z.union([z.literal("admin"), z.literal("user")])
});

type UserId = z.infer<typeof UserId>;
type Email = z.infer<typeof Email>;
type User = z.infer<typeof User>;

// Using branded types
function getUserById(id: UserId): User | null {
  // In a real app, would look up user
  const result = UserId.safeParse(id);
  if (result.success) {
    return User.parse({
      id,
      email: "user@example.com",
      role: "user"
    });
  }
  return null;
}

export { UserId, Email, User, getUserById };