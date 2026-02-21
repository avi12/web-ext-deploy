export const Colors = {
  Red: "\x1b[31m",
  Green: "\x1b[32m",
  Blue: "\x1b[34m",
  Yellow: "\x1b[33m",
  Reset: "\x1b[0m"
};

export function red (str: string) {
  return `${Colors.Red}${str}${Colors.Reset}`;
}

export function green (str: string) {
  return `${Colors.Green}${str}${Colors.Reset}`;
}

export function blue (str: string) {
  return `${Colors.Blue}${str}${Colors.Reset}`;
}

export function yellow (str: string) {
  return `${Colors.Yellow}${str}${Colors.Reset}`;
}
