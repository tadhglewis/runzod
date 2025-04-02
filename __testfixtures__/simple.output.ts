import z from 'zod';

// Basic primitive types
const StringType = z.string();
const NumberType = z.number();
const BooleanType = z.boolean();

// Object type
const Person = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  skills: z.array(z.string())
});