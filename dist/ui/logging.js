const Colors = {
    Red: "\x1b[31m",
    Green: "\x1b[32m",
    Blue: "\x1b[34m",
    Yellow: "\x1b[33m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
    Gray: "\x1b[90m",
    Bold: "\x1b[1m",
    Reset: "\x1b[0m"
};
export function storeError(message) {
    return red(message);
}
export function red(text) {
    return `${Colors.Red}${text}${Colors.Reset}`;
}
export function green(text) {
    return `${Colors.Green}${text}${Colors.Reset}`;
}
export function blue(text) {
    return `${Colors.Blue}${text}${Colors.Reset}`;
}
export function yellow(text) {
    return `${Colors.Yellow}${text}${Colors.Reset}`;
}
