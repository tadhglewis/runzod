import { 
  String, 
  Number, 
  Boolean,
  Object, 
  Array, 
  Union, 
  Literal, 
  Intersect,
  type Static 
} from "runtypes";

// Define some base types
const Id = String.withBrand("Id");
const Email = String.withConstraint(
  email => /^\S+@\S+\.\S+$/.test(email) || "Invalid email format"
);
const PositiveNumber = Number.withConstraint(
  n => n > 0 || "Number must be positive"
);

// Object with optional fields
const Address = Object({
  street: String,
  city: String,
  state: String.optional(),
  zipCode: String,
  country: String.withConstraint(c => c.length === 2 || "Country code must be 2 characters")
});

// Combining objects with intersect
const PersonBase = Object({
  id: Id,
  name: String,
  email: Email,
  age: PositiveNumber,
  active: Boolean
});

const WithAddress = Object({
  address: Address
});

const WithContacts = Object({
  contacts: Array(String)
});

// Combined person type
const Person = Intersect(
  PersonBase,
  Union(
    WithAddress,
    WithContacts,
    Intersect(WithAddress, WithContacts)
  )
);

// Union of literal values
const Role = Union(
  Literal("admin"),
  Literal("user"),
  Literal("guest")
);

// Final user type combining everything
const User = PersonBase.extend({
  role: Role,
  permissions: Array(String),
  lastLogin: String.optional()
}).asReadonly();

// Extract the static types
type Id = Static<typeof Id>;
type Email = Static<typeof Email>;
type Address = Static<typeof Address>;
type Person = Static<typeof Person>;
type Role = Static<typeof Role>;
type User = Static<typeof User>;

// Usage with guard
function processUser(input: unknown): User | null {
  if (User.guard(input)) {
    // Type is narrowed to User
    console.log(`Processing user ${input.name} with role ${input.role}`);
    return input;
  }
  return null;
}

// Usage with check (throws on invalid)
function createUser(input: unknown): User {
  try {
    const user = User.check(input);
    console.log(`Created user ${user.id}`);
    return user;
  } catch (error) {
    console.error("Invalid user data:", error);
    throw new Error("Failed to create user due to validation errors");
  }
}

// Picking specific fields
const UserSummary = User.pick("id", "name", "role");
type UserSummary = Static<typeof UserSummary>;

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