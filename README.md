# RunZod

A codemod to migrate from [runtypes](https://github.com/pelotom/runtypes) to [zod](https://github.com/colinhacks/zod).

## Features

- Transforms imports/requires from runtypes to zod
- Converts type definitions to zod schemas
- Updates validation methods and error handling patterns
- Handles both TypeScript and JavaScript codebases
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
```

## Transformations

| Runtypes | Zod |
|----------|-----|
| `import { String } from 'runtypes'` | `import { string } from 'zod'` |
| `String()` | `z.string()` |
| `Number()` | `z.number()` |
| `Boolean()` | `z.boolean()` |
| `Array(Type)` | `z.array(Type)` |
| `Record({...})` | `z.object({...})` |
| `Dictionary(K, V)` | `z.record(K, V)` |
| `Union([A, B])` | `z.union([A, B])` |
| `Intersect(A, B)` | `z.intersection(A, B)` |
| `Literal(x)` | `z.literal(x)` |
| `Type.optional()` | `Type.optional()` |
| `Type.check(data)` | `Type.parse(data)` |
| `Type.validate(data)` | `Type.safeParse(data)` |
| `result.failure` | `!result.success` |

## Example

### Before (runtypes)

```typescript
import { String, Number, Array, Record, Optional } from 'runtypes';

const Person = Record({
  name: String(),
  age: Number(),
  hobbies: Array(String()),
  address: Optional(String())
});

function validatePerson(data: unknown) {
  const result = Person.validate(data);
  
  if (result.success) {
    return result.value;
  }
  
  if (result.failure) {
    throw new Error(result.message);
  }
}
```

### After (zod)

```typescript
import { string, number, array, object, optional } from 'zod';
import * as z from 'zod';

const Person = z.object({
  name: z.string(),
  age: z.number(),
  hobbies: z.array(z.string()),
  address: z.string().optional()
});

function validatePerson(data: unknown) {
  const result = Person.safeParse(data);
  
  if (result.success) {
    return result.value;
  }
  
  if (!result.success) {
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

# Test on example files
npm run test:codemod
```

## License

MIT