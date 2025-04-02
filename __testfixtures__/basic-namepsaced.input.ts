import * as t from "runtypes";

// Basic primitive types
const StringType = String;
const NumberType = Number;
const BooleanType = Boolean;

// Complex types
const ArrayType = t.Array(t.String);
const TupleType = t.Tuple(t.String, t.Number, t.Boolean);
const ObjectType = t.Object({
  name: t.String,
  age: t.Number,
  isActive: t.Boolean,
  tags: t.Array(t.String),
});

// Runtypes used to use `t.Record` instead of `t.Object`. We should transform both to zod
// @ts-expect-error
const RuntypesV1Record = t.Record({
  name: t.String,
  age: t.Number,
  isActive: t.Boolean,
  tags: t.Array(t.String),
});

// Union and Literal types
const LiteralType = t.Literal("hello");
const UnionType = t.Union(t.String, t.Number, t.Literal(42));

// Optional and constrained types
const OptionalType = Object({
  name: t.String,
  age: t.Optional(t.Number),
});

const ConstrainedNumber = t.Number.withConstraint(
  (n) => n > 0 || "Must be positive"
);

// Dictionary type
const DictionaryType = t.Record(t.String, t.Number);

// Using types for validation
function validatePerson(data: unknown) {
  try {
    const result = ObjectType.check(data);
    console.log("Valid person:", result);
    return result;
  } catch (err: unknown) {
    if (err instanceof t.ValidationError) {
      console.error("Invalid person:", err.message);
      return null;
    }
  }
}
