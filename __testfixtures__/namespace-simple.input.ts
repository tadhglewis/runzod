import z from 'zod';

// Using namespace import for basic types
const StringType = z.string();
const NumberType = z.number();
const BooleanType = z.boolean();

// Simple function call
const ArrayType = z.array(z.string());

// Nested object
const Person = z.object({
  name: z.string(),
  age: z.number()
});