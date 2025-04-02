# RunZod

A codemod to migrate from [runtypes](https://github.com/runtypes/runtypes) to [zod](https://github.com/colinhacks/zod).

## Features

- Transforms imports/requires from runtypes to zod
- Converts type definitions to zod schemas
- Handles both direct imports and namespace imports
- Works with TypeScript files
- Preserves code style and formatting

## Installation

```bash
# Global installation
npm install -g runzod

# Or use without installing
npx runzod <path-to-your-code>
```

## Usage

```bash
# Run on a directory
runzod src/

# Run on specific files
runzod src/types.ts src/validation.ts

# Using jscodeshift directly
npx jscodeshift -t node_modules/runzod/dist/transform.js --extensions=ts,tsx ./src/myfile.ts
```

## Transformations

| Runtypes | Zod |
|----------|-----|
| `import { String } from 'runtypes'` | `import z from 'zod'` |
| `import * as RT from 'runtypes'` | `import z from 'zod'` |
| `String` | `z.string()` |
| `Number` | `z.number()` |
| `Boolean` | `z.boolean()` |
| `Undefined` | `z.undefined()` |
| `Null` | `z.null()` |
| `Array(String)` | `z.array(z.string())` |
| `Tuple(String, Number)` | `z.tuple([z.string(), z.number()])` |
| `Object({...})` | `z.object({...})` |
| `Record(String, Number)` | `z.record(z.string(), z.number())` |
| `Dictionary(String, Number)` | `z.record(z.string(), z.number())` |
| `Union(String, Number)` | `z.union([z.string(), z.number()])` |
| `Literal(x)` | `z.literal(x)` |
| `Optional(String)` | `z.string().optional()` |
| `Number.withConstraint(...)` | `z.number().refine(...)` |

## Examples

### Named imports

#### Before (runtypes)

```typescript
import { String, Number, Boolean, Array, Object, Optional } from 'runtypes';

const Person = Object({
  name: String,
  age: Number,
  isActive: Boolean,
  hobbies: Array(String),
  address: Optional(String)
});

function validatePerson(data: unknown) {
  const result = Person.validate(data);
  
  if (result.success) {
    return result.value;
  } else {
    throw new Error(result.message);
  }
}
```

#### After (zod)

```typescript
import z from 'zod';

const Person = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  hobbies: z.array(z.string()),
  address: z.string().optional()
});

function validatePerson(data: unknown) {
  const result = Person.validate(data);
  
  if (result.success) {
    return result.value;
  } else {
    throw new Error(result.message);
  }
}
```

### Namespace imports

#### Before (runtypes)

```typescript
import * as RT from 'runtypes';

const Person = RT.Object({
  name: RT.String,
  age: RT.Number,
  hobbies: RT.Array(RT.String),
  address: RT.Object({
    street: RT.String,
    city: RT.String
  })
});

function validatePerson(data: unknown) {
  const result = Person.validate(data);
  
  if (result.success) {
    return result.value;
  } else {
    throw new Error(result.message);
  }
}
```

#### After (zod)

```typescript
import z from 'zod';

const Person = z.object({
  name: z.string(),
  age: z.number(),
  hobbies: z.array(z.string()),
  address: z.object({
    street: z.string(),
    city: z.string()
  })
});

function validatePerson(data: unknown) {
  const result = Person.validate(data);
  
  if (result.success) {
    return result.value;
  } else {
    throw new Error(result.message);
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Test on example files
npm run test:codemod
```

## Notes

- The codemod transforms the schema definitions but doesn't change validation method calls
- You may need to update your validation logic after transformation:
  - `runtype.validate(data)` → `schema.safeParse(data)`
  - Error handling will differ between the libraries

## License

MIT