import { ValueTransformer } from 'typeorm';

/**
 * El driver `pg` devuelve las columnas `decimal` como string, no como number
 * (un decimal de Postgres puede exceder la precision de un number de JS).
 * Sin esto, "15000.00" + 100 devuelve "15000.00100" y el bug es silencioso.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
