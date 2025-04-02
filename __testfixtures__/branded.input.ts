import { String, Number, Object, Literal, type Static } from "runtypes";

// Branded types example
const UserId = String.withBrand("UserId");
const Email = String.withConstraint(
  s => /\S+@\S+\.\S+/.test(s) || "Invalid email format"
).withBrand("Email");

const User = Object({
  id: UserId,
  email: Email,
  role: Literal("admin").or(Literal("user"))
});

type UserId = Static<typeof UserId>;
type Email = Static<typeof Email>;
type User = Static<typeof User>;

// Using branded types
function getUserById(id: UserId): User | null {
  // In a real app, would look up user
  if (UserId.guard(id)) {
    return User.check({
      id,
      email: "user@example.com",
      role: "user"
    });
  }
  return null;
}

export { UserId, Email, User, getUserById };