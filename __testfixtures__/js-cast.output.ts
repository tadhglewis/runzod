// Import runtypes
import z from 'zod';

// Define a runtype schema
const Person = {
  name: z.string(),
  age: z.number()
};

// JS cast functions that should NOT be transformed
function formatData(value: any) {
  return String(value);
}

function getValue() {
  return Number('42');
}