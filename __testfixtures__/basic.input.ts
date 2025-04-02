import {
  String,
  Number,
  Boolean,
  Array,
  Tuple,
  Object,
  Union,
  Literal,
  Optional,
  Record,
} from "runtypes";

// Basic primitive types
const StringType = String;
const NumberType = Number;
const BooleanType = Boolean;

// Complex types
const ArrayType = Array(String);
const TupleType = Tuple(String, Number, Boolean);
const ObjectType = Object({
  name: String,
  age: Number,
  isActive: Boolean,
  tags: Array(String),
});

// Union and Literal types
const LiteralType = Literal("hello");
const UnionType = Union(String, Number, Literal(42));

// Optional and constrained types
const OptionalType = Object({
  name: String,
  age: Optional(Number),
});

const ConstrainedNumber = Number.withConstraint(
  (n) => n > 0 || "Must be positive"
);

// Dictionary type
const DictionaryType = Record(String, Number);
