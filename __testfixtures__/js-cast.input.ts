// Import runtypes
import { String, Number } from 'runtypes';

// Define a runtype schema
const Person = {
  name: String,
  age: Number
};

// JS cast functions that should NOT be transformed
function formatData(value: any) {
  return String(value);
}

function getValue() {
  return Number('42');
}