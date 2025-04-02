import * as z from 'zod';

// Define types using namespace import
const Person = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  hobbies: z.array(z.string()),
  address: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string().optional()
  })
});

// Validation example
function validatePerson(data: unknown) {
  const result = Person.safeParse(data);
  
  if (result.success) {
    console.log('Valid person:', result.value);
    return true;
  }
  
  if (!result.success) {
    console.error('Invalid person:', result.message);
    return false;
  }
}