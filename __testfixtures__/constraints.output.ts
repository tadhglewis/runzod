import z from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Uuid = z.string().refine(
  (s) => UUID_REGEX.test(s),
  { message: "String must be a UUID" }
);

export const NamedConstraint = z.number().refine(
  (n) => n > 0,
  { message: "Must be positive" }
);