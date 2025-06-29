# runzod

## 2.2.0

### Minor Changes

- 65d468e: Add Zod 4 compatibility and improve JavaScript builtin handling

  - **FEAT**: Update import generation to use `zod/v4` for Zod 4 compatibility
  - **FEAT**: Add support for new Zod 4 object methods (`.strict()` → `z.strictObject()`, `.passthrough()` → `z.looseObject()`)
  - **FIX**: Significantly improve JavaScript builtin detection to prevent incorrect transformations
  - **REFACTOR**: Replace brittle regex-based post-processing with robust AST-based transformations
  - **IMPROVEMENT**: Enhanced context-aware detection between runtypes schema usage and JavaScript builtin usage

  This update ensures that:

  - `Boolean()`, `String()`, `Number()`, `Symbol()` calls remain as JavaScript built-ins
  - `.filter(Boolean)` stays as native `Boolean` instead of being transformed to `z.boolean()`
  - Only actual runtypes imports get transformed to their Zod equivalents
  - Generated code uses Zod 4 API patterns for future compatibility

## 2.1.4

### Patch Changes

- 8d04f66: Fix JS array builtin transformation

## 2.1.3

### Patch Changes

- cdf3bd0: Fix compiled build

## 2.1.2

### Patch Changes

- 47dba5d: Refactor and fix small bugs

## 2.1.1

### Patch Changes

- 4a8bbde: Fix pnpm codeshift imports

## 2.1.0

### Minor Changes

- 2b29c9f: Fix required dependency

## 2.0.0

### Major Changes

- 56e2054: Initial release of runzod:
  - Transforms runtypes code to zod
  - Converts import syntax, type definitions, validation methods
  - Handles JavaScript built-in functions (Boolean, String, Number, Symbol)
  - Updates validation methods and type inference patterns
