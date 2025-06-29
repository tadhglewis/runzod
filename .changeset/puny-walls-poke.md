---
"runzod": minor
---

Add Zod 4 compatibility and improve JavaScript builtin handling

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
