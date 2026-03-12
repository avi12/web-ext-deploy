export type CamelToKebab<Str extends string> =
  Str extends `${infer Head}${infer Tail}`
    ? Head extends Uppercase<Head>
      ? Head extends Lowercase<Head>
        ? `${Head}${CamelToKebab<Tail>}`
        : `-${Lowercase<Head>}${CamelToKebab<Tail>}`
      : `${Head}${CamelToKebab<Tail>}`
    : Str;

export function camelCase(text: string) {
  return text
    .replace(/[-_\s]+(\w)/g, (_: string, char: string) => char.toUpperCase())
    .replace(/^[a-z]/, char => char.toLowerCase());
}

export function kebabCase(text: string) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function capitalCase(text: string) {
  return text.replace(/\b\w/g, char => char.toUpperCase());
}

export function screamingSnakeCase(text: string) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}
