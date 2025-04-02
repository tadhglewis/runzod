Processing 1 files... 
// Import runtypes
const { string, number, boolean, array, object } = require('runtypes');

// Define some types
const Person = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  hobbies: z.array(z.string())
});

// Validate data
function validatePerson(data) {
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

// Another validation method
try {
  const person = Person.parse(data);
  console.log('Valid:', person);
} catch (error) {
  console.error('Invalid:', error.message);
}
All done. 
Results: 
0 errors
0 unmodified
0 skipped
1 ok
Time elapsed: 0.214seconds 
