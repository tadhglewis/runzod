import * as RT from 'runtypes';

// Using namespace import
const StringType = RT.String;
const NumberType = RT.Number;
const BooleanType = RT.Boolean;

// Complex types with namespace
const ArrayType = RT.Array(RT.String);
const TupleType = RT.Tuple(RT.String, RT.Number, RT.Boolean);
const ObjectType = RT.Object({
  name: RT.String,
  age: RT.Number,
  isActive: RT.Boolean,
  tags: RT.Array(RT.String),
  metadata: RT.Record(RT.String, RT.String)
});

// Union and Literal types
const LiteralType = RT.Literal('hello');
const UnionType = RT.Union(RT.String, RT.Number, RT.Literal(42));

// Optional types
const OptionalType = RT.Object({
  name: RT.String,
  age: RT.Optional(RT.Number)
});

// Nested structures
const NestedType = RT.Object({
  user: RT.Object({
    profile: RT.Object({
      details: RT.Object({
        favoriteColors: RT.Array(RT.String)
      })
    })
  })
});