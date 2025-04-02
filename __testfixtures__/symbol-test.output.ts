import { z } from "zod";

// Define schema with Symbol type
const Config = {
  id: z.string(),
  active: z.boolean(),
  type: z.symbol()
};

// JavaScript Symbol usage
const METADATA = Symbol('metadata');
const FAILURE = Symbol('isFailure');
const SUCCESS = Symbol('isSuccess');

// Multi-line Symbol
const COMPLEX = Symbol(
  'complexSymbol'
);

// With computed expressions
function createSymbol(name: string) {
  return Symbol('prefix_' + name);
}

export { Config, METADATA, FAILURE, SUCCESS, COMPLEX };