# runzod

A codemod to migrate from [runtypes](https://github.com/pelotom/runtypes) to [zod](https://github.com/colinhacks/zod).

## Features

- Transforms imports/requires from runtypes to zod
- Converts type definitions to zod schemas
- Updates validation methods (check → parse, guard → safeParse)
- Converts Static<typeof X> to z.infer<typeof X>
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
runzod <directory> [options]
```

### Options

- `--dry`: Do not write to files, just show what would be changed
- `--extensions`: File extensions to process (default: ts,tsx)
- `--help, -h`: Show help message
- `--verbose, -v`: Show more information during processing

### Examples

```bash
# Transform all TypeScript files in the src directory
runzod ./src

# Dry run to see what would be changed
runzod ./src --dry

# Transform only specific file extensions
runzod ./src --extensions ts,tsx

# Show verbose output
runzod ./src -v

# Using jscodeshift directly
npx jscodeshift -t node_modules/runzod/dist/transform.js --extensions=ts,tsx ./src/myfile.ts
```

## Transformations

| Runtypes | Zod |
|----------|-----|
| `import { String } from 'runtypes'` | `import * as z from 'zod'` |
| `String` | `z.string()` |
| `Number` | `z.number()` |
| `Boolean` | `z.boolean()` |
| `BigInt` | `z.bigint()` |
| `Undefined` | `z.undefined()` |
| `Null` | `z.null()` |
| `Array(String)` | `z.array(z.string())` |
| `Tuple(String, Number)` | `z.tuple([z.string(), z.number()])` |
| `Object({...})` | `z.object({...})` |
| `Record(String, Number)` | `z.record(z.string(), z.number())` |
| `Union(A, B, C)` | `z.union([A, B, C])` |
| `Intersect(A, B)` | `z.intersection([A, B])` |
| `Literal(x)` | `z.literal(x)` |
| `Optional(String)` | `z.string().optional()` |
| `String.optional()` | `z.string().optional()` |
| `String.withConstraint(...)` | `z.string().refine(...)` |
| `String.withBrand("Brand")` | `z.string().brand("Brand")` |
| `Type.check(data)` | `Type.parse(data)` |
| `Type.guard(data)` | `Type.safeParse(data)` |
| `Static<typeof Type>` | `z.infer<typeof Type>` |

## Examples

### Basic Usage

```typescript
// Before (runtypes)
import { String, Number, Boolean, Array, Object, type Static } from 'runtypes';

const User = Object({
  name: String,
  age: Number,
  isActive: Boolean,
  tags: Array(String)
});

type User = Static<typeof User>;

if (User.guard(data)) {
  console.log(`User ${data.name} is ${data.age} years old`);
}

// After (zod)
import * as z from 'zod';

const User = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  tags: z.array(z.string())
});

type User = z.infer<typeof User>;

const result = User.safeParse(data);
if (result.success) {
  console.log(`User ${result.data.name} is ${result.data.age} years old`);
}
```

### Branded Types

```typescript
// Before (runtypes)
import { String, withBrand, type Static } from 'runtypes';

const UserId = String.withBrand("UserId");
type UserId = Static<typeof UserId>;

// After (zod)
import * as z from 'zod';

const UserId = z.string().brand("UserId");
type UserId = z.infer<typeof UserId>;
```

## Limitations

The codemod handles most common cases, but there are some limitations:

- Complex constraints may need manual adjustment
- The `match` pattern from runtypes needs manual conversion to zod patterns
- Recursive types may require adjustments
- Some method chaining might require manual fixes
- Branded type handling might require additional changes

## Post-Migration Steps

After running the codemod:

1. Add "zod" to your dependencies if it's not already there
2. Review the transformed files manually
3. Update validation logic based on zod's patterns:
   - `runtype.guard(data)` becomes `schema.safeParse(data)` 
     (but you'll need to access `result.data` when success is true)
   - Error handling differs between libraries
4. Run your tests to ensure everything still works

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

## License

MIT