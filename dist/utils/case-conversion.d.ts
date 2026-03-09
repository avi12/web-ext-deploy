export type CamelToKebab<Str extends string> = Str extends `${infer Head}${infer Tail}` ? Head extends Uppercase<Head> ? Head extends Lowercase<Head> ? `${Head}${CamelToKebab<Tail>}` : `-${Lowercase<Head>}${CamelToKebab<Tail>}` : `${Head}${CamelToKebab<Tail>}` : Str;
export declare function camelCase(text: string): string;
export declare function kebabCase(text: string): string;
export declare function capitalCase(text: string): string;
export declare function screamingSnakeCase(text: string): string;
//# sourceMappingURL=case-conversion.d.ts.map