import { t } from "elysia";

/**
 * Shared TypeBox primitives for route validation.
 *
 * Numeric fields accept a number or a numeric string: the frontends and
 * kiosk clients are not consistent about quoting numbers in JSON, and the
 * handlers already normalise with `Number(...)`. Anything that is not
 * numeric is rejected before the handler runs.
 */
export const numberLike = t.Union([t.Number(), t.String({ pattern: "^\\s*-?\\d+(\\.\\d+)?\\s*$" })]);

export const optionalNumberLike = t.Optional(numberLike);

export const optionalString = t.Optional(t.String());

export const optionalNullableString = t.Optional(t.Union([t.String(), t.Null()]));

export const optionalBoolean = t.Optional(t.Boolean());

export const nonEmptyString = t.String({ minLength: 1 });

export const optionalNonEmptyString = t.Optional(t.String({ minLength: 1 }));

/** Any JSON object; values stay untyped. */
export const jsonObject = t.Record(t.String(), t.Unknown());

export const optionalJsonObject = t.Optional(jsonObject);

export const metadata = t.Optional(t.Record(t.String(), t.Unknown()));

export const auditNotes = t.Optional(t.String({ maxLength: 2000 }));

/**
 * Query-string number: Elysia's Numeric coerces "25" to 25 and rejects
 * non-numeric values, so handlers can use the value directly.
 */
export const queryNumber = t.Optional(t.Numeric());

/** Fields shared by the paginated list endpoints. */
export const listQueryFields = {
  page: t.Optional(t.Numeric()),
  limit: t.Optional(t.Numeric()),
  search: t.Optional(t.String()),
};

type ValidationIssue = { path?: string; message?: string };

/**
 * Renders Elysia's first validation issue as the API's `{ detail }` string,
 * e.g. `body.duration_months: Expected number`.
 */
export function validationDetail(error: unknown): string {
  const issues = (error as { all?: ValidationIssue[] } | null)?.all;
  const first = issues?.[0];
  const rawPath = first?.path ?? "";
  const path = rawPath.replace(/^\//, "").replaceAll("/", ".");
  const message = first?.message ?? "Invalid request.";
  return path ? `${path}: ${message}` : message;
}
