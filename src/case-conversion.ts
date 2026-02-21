export function camelCase (str: string) {
  return str
    .replace(/[-_\s]+(\w)/g, (_: string, char: string) => char.toUpperCase())
    .replace(/^[a-z]/, char => char.toLowerCase());
}

export function kebabCase (str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function capitalCase (str: string) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

export function screamingSnakeCase (str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}
