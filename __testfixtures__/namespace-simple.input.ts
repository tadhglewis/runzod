import * as t from 'runtypes';

// Using namespace import for basic types
const StringType = t.String;
const NumberType = t.Number;
const BooleanType = t.Boolean;

// Simple function call
const ArrayType = t.Array(t.String);

// Nested object
const Person = t.Object({
  name: t.String,
  age: t.Number
});