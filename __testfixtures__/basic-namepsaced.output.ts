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

// Runtypes used to use `t.Record` instead of `t.Object`. We should transform both to zod
// @ts-expect-error
const RuntypesV1Record = z.object({
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
  try {
    const result = ObjectType.parse(data);
    console.log("Valid person:", result);
    return result;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      console.error("Invalid person:", err.message);
      return null;
    }
  }
}
