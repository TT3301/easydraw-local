export type ValueOf<T> = T[keyof T];
export type Merge<M, N> = Omit<M, keyof N> & N;
export type MarkNonNullable<T, K extends keyof T> = {
  [P in K]-?: NonNullable<T[P]>;
} & { [P in keyof T]: T[P] };
export type MakeBrand<T extends string> = { [K in `~brand~${T}`]: T };
