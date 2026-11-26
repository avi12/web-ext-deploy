import { ReadStream } from "node:fs";

import { z } from "zod";

import { createGuard } from "./zod-guard.js";

export const isReadStream = createGuard(z.instanceof(ReadStream));
export const isError = createGuard(z.instanceof(Error));
export const isString = createGuard(z.string());
