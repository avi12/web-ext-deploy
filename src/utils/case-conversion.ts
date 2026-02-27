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
