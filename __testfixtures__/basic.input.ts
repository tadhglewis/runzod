import { String, Number, Boolean, Object, Array, Union, Literal, type Static } from "runtypes";

// Basic schema definitions
const User = Object({
  id: String,
  name: String,
  age: Number,
  isActive: Boolean,
  tags: Array(String),
  role: Union(
    Literal("admin"),
    Literal("user"),
    Literal("guest")
  )
});

type User = Static<typeof User>;

// Using the schemas
function validateUser(data: unknown) {
  if (User.guard(data)) {
    // data is now typed as User
    console.log(`User ${data.name} is ${data.age} years old`);
    return true;
  }
  return false;
}

function processUser(rawData: unknown) {
  try {
    const user = User.check(rawData);
    console.log(`Validated user: ${user.name}`);
    return user;
  } catch (error) {
    console.error("Validation failed:", error);
    return null;
  }
}

export { User, validateUser, processUser };