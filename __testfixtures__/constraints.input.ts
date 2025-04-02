import * as t from "runtypes";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Uuid = t.String.withConstraint(
  (s) => UUID_REGEX.test(s) || "String must be a UUID"
);

export const NamedConstraint = t.Number.withConstraint(
  (n) => n > 0,
  { name: "Must be positive" }
);