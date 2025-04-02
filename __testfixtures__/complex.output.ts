import { z } from "zod";

// Define some base types
const Id = z.string().brand("Id");
const Email = z.string().refine(
  email => /^\S+@\S+\.\S+$/.test(email), 
  "Invalid email format"
);
const PositiveNumber = z.number().refine(
  n => n > 0, 
  "Number must be positive"
);

// Object with optional fields
const Address = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string().optional(),
  zipCode: z.string(),
  country: z.string().refine(c => c.length === 2, "Country code must be 2 characters")
});

// Combining objects with intersect
const PersonBase = z.object({
  id: Id,
  name: z.string(),
  email: Email,
  age: PositiveNumber,
  active: z.boolean()
});

const WithAddress = z.object({
  address: Address
});

const WithContacts = z.object({
  contacts: z.array(z.string())
});

// Combined person type
const Person = z.intersection([
  PersonBase,
  z.union([
    WithAddress,
    WithContacts,
    z.intersection([WithAddress, WithContacts])
  ])
]);

// Union of literal values
const Role = z.union([
  z.literal("admin"),
  z.literal("user"),
  z.literal("guest")
]);

// Final user type combining everything
const User = PersonBase.extend({
  role: Role,
  permissions: z.array(z.string()),
  lastLogin: z.string().optional()
}).readonly();

// Extract the static types
type Id = z.infer<typeof Id>;
type Email = z.infer<typeof Email>;
type Address = z.infer<typeof Address>;
type Person = z.infer<typeof Person>;
type Role = z.infer<typeof Role>;
type User = z.infer<typeof User>;

// Usage with guard
function processUser(input: unknown): User | null {
  const result = User.safeParse(input);
  if (result.success) {
    // Type is narrowed to User
    console.log(`Processing user ${result.data.name} with role ${result.data.role}`);
    return result.data;
  }
  return null;
}

// Usage with check (throws on invalid)
function createUser(input: unknown): User {
  try {
    const user = User.parse(input);
    console.log(`Created user ${user.id}`);
    return user;
  } catch (error) {
    console.error("Invalid user data:", error);
    throw new Error("Failed to create user due to validation errors");
  }
}

// Picking specific fields
const UserSummary = User.pick({
  id: true,
  name: true,
  role: true
});
type UserSummary = z.infer<typeof UserSummary>;

// Using match for pattern matching
function getRoleDisplayName(role: Role): string {
  switch (role) {
    case "admin": return "Administrator";
    case "user": return "Regular User";
    case "guest": return "Guest User";
    default: return "Unknown";
  }
}

export {
  Id,
  Email,
  Address,
  Person,
  Role,
  User,
  UserSummary,
  processUser,
  createUser,
  getRoleDisplayName
};