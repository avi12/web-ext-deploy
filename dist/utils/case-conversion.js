export function camelCase(text) {
    return text
        .replace(/[-_\s]+(\w)/g, (_, char) => char.toUpperCase())
        .replace(/^[a-z]/, char => char.toLowerCase());
}
export function kebabCase(text) {
    return text
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase();
}
export function capitalCase(text) {
    return text.replace(/\b\w/g, char => char.toUpperCase());
}
export function screamingSnakeCase(text) {
    return text
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toUpperCase();
}
