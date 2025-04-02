import { String, Number, Boolean, Object, Array } from 'runtypes';

// Basic primitive types
const StringType = String;
const NumberType = Number;
const BooleanType = Boolean;

// Object type
const Person = Object({
  name: String,
  age: Number,
  isActive: Boolean,
  skills: Array(String)
});