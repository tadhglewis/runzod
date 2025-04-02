// JavaScript cast functions - these should NOT be transformed
function parseData(input: string) {
  // These are JavaScript conversions, not runtypes
  const num = Number(input);
  const str = String(123);
  const bool = Boolean(0);
  
  return { num, str, bool };
}

// Import with namespace alias
import * as t from 'runtypes';

// Using namespace imports
const UserSchema = t.Record({
  id: t.String,
  age: t.Number,
  isActive: t.Boolean,
  tags: t.Array(t.String),
  profile: t.Object({
    bio: t.String,
    settings: t.Record(t.String, t.Boolean)
  }),
  role: t.Union(t.Literal('admin'), t.Literal('user')),
  coordinates: t.Tuple(t.Number, t.Number)
});

// With optional fields
const FormSchema = t.Object({
  name: t.String,
  email: t.String,
  phone: t.Optional(t.String)
});