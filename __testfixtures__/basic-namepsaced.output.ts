import z from "zod";

// Basic primitive types
const StringType = z.string();
const NumberType = z.number();
const BooleanType = z.boolean();

// Complex types
const ArrayType = z.array(z.string());
const TupleType = z.tuple([z.string(), z.number(), z.boolean()]);
const ObjectType = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  tags: z.array(z.string()),
});

// Union and Literal types
const LiteralType = z.literal("hello");
const UnionType = z.union([z.string(), z.number(), z.literal(42)]);

// Optional and constrained types
const OptionalType = z.object({
  name: z.string(),
  age: z.number().optional(),
});

const ConstrainedNumber = z.number().refine((n) => n > 0 || "Must be positive");

// Dictionary type
const DictionaryType = z.record(z.string(), z.number());

// Using types for validation
function validatePerson(data: unknown) {
  const result = ObjectType.safeParse(data);
  if (result.success) {
    console.log("Valid person:", result.data);
    return result.data;
  } else {
    console.error("Invalid person:", result.error);
    return null;
  }
}
