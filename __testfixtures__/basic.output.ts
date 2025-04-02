import { string, number, boolean, array, object, literal, union, intersection, optional, record } from 'zod';
import * as z from 'zod';

// Basic types
const StringType = z.string();
const NumberType = z.number();
const BooleanType = z.boolean();

// Array type
const StringArrayType = z.array(z.string());

// Object type
const PersonType = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  tags: z.array(z.string()),
  address: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string().optional()
  })
});

// Union type
const StatusType = z.union([
  z.literal('pending'),
  z.literal('active'),
  z.literal('inactive')
]);

// Dictionary type
const DictionaryType = z.record(z.string(), z.number());

// Optional fields
const OptionalFieldType = z.object({
  required: z.string(),
  optional: z.number().optional()
});

// Validation example
function validatePerson(data: unknown) {
  const result = PersonType.safeParse(data);
  
  if (result.success) {
    console.log('Valid person:', result.value);
    return true;
  }
  
  if (!result.success) {
    console.error('Invalid person:', result.message);
    return false;
  }
}

// Check example
function checkPerson(data: unknown) {
  try {
    const person = PersonType.parse(data);
    console.log('Valid person:', person);
    return true;
  } catch (error) {
    console.error('Invalid person:', error.message);
    return false;
  }
}