import { String, Number, Boolean, Array, Record, Literal, Union, Intersect, Optional, Dictionary } from 'runtypes';

// Basic types
const StringType = String();
const NumberType = Number();
const BooleanType = Boolean();

// Array type
const StringArrayType = Array(String());

// Object type
const PersonType = Record({
  name: String(),
  age: Number(),
  isActive: Boolean(),
  tags: Array(String()),
  address: Record({
    street: String(),
    city: String(),
    country: String().optional()
  })
});

// Union type
const StatusType = Union([
  Literal('pending'),
  Literal('active'),
  Literal('inactive')
]);

// Dictionary type
const DictionaryType = Dictionary(String(), Number());

// Optional fields
const OptionalFieldType = Record({
  required: String(),
  optional: Optional(Number())
});

// Validation example
function validatePerson(data: unknown) {
  const result = PersonType.validate(data);
  
  if (result.success) {
    console.log('Valid person:', result.value);
    return true;
  }
  
  if (result.failure) {
    console.error('Invalid person:', result.message);
    return false;
  }
}

// Check example
function checkPerson(data: unknown) {
  try {
    const person = PersonType.check(data);
    console.log('Valid person:', person);
    return true;
  } catch (error) {
    console.error('Invalid person:', error.message);
    return false;
  }
}
