import z from 'zod';

// Using namespace import
const StringType = z.string();
const NumberType = z.number();
const BooleanType = z.boolean();

// Complex types with namespace
const ArrayType = z.array(z.string());
const TupleType = z.tuple([z.string(), z.number(), z.boolean()]);
const ObjectType = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.string())
});

// Union and Literal types
const LiteralType = z.literal('hello');
const UnionType = z.union([z.string(), z.number(), z.literal(42)]);

// Optional types
const OptionalType = z.object({
  name: z.string(),
  age: z.number().optional()
});

// Nested structures
const NestedType = z.object({
  user: z.object({
    profile: z.object({
      details: z.object({
        favoriteColors: z.array(z.string())
      })
    })
  })
});