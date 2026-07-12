/**
 * Reusable table error contract (issue #70, N17 / C3 / C4).
 *
 * Additive shared module — the single import point for the table error contract
 * consumed by `SortableTable` (#61) and the DQ / Committee screens (#62).
 */
export { TableErrorState } from './TableErrorState';
export { resolveTableErrorContract, useTableErrorContract } from './tableErrorContract';
export type {
    TableErrorContract,
    TableErrorContractInput,
    TableErrorMode,
    TableErrorStateProps,
    TableErrorVariant,
} from './types';
