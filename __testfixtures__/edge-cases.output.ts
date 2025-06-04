import { z } from "zod";

// Schema with Boolean
const Config = z.object({
  active: z.boolean()
});

// First issue: Array.filter(Boolean)
function filterValidItems(items: any[]) {
  // This should remain as filter(Boolean), not become filter(z.boolean())
  return items.filter(Boolean);
}

// More complex example with array literal
function getValidFlags() {
  const flags = [true, false, null, undefined, 0, 1].filter(Boolean);
  return flags;
}

// Second issue: Multi-line Boolean
function isPropertyValid(obj: any, prop: string) {
  // This should remain as Boolean(), not become z.boolean()()
  return obj && Boolean(
    obj[prop]
  );
}

// Complex nested example
function validateData(data: any) {
  if (data &&
      data.config &&
      Boolean(
        data.config.settings &&
        data.config.settings.enabled
      )) {
    return true;
  }
  return false;
}

// do not modify Javascript built-in array prototype
const array = Array(5).keys()
