/** A message: plain, or plural forms picked with Intl.PluralRules on `count` ("one" / "other", "zero" optional). */
export type Msg = string | { zero?: string; one: string; other: string }

/** Same keys as the French source, nothing more, nothing less. */
export type Shape<T> = { [K in keyof T]: Msg }

/** One namespace in the three languages. French is the source; en and es must have exactly its keys. */
export const ns = <T extends Record<string, Msg>>(fr: T, en: Shape<T>, es: Shape<T>) => ({ fr, en, es })
