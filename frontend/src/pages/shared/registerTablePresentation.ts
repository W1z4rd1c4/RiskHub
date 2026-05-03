import type { CollectionGroup } from '@/types/collection';
import {
    buildRegisterGroupCards,
    type RegisterGroupCardModel,
    type RegisterGroupPresentationDefinition,
} from '@/components/tables/registerGroupPresentation';

export interface RegisterTablePaginationFacts {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
}

export interface RegisterTableDefinition<TRow> {
    emptyText: string;
    groupPresentation?: RegisterGroupPresentationDefinition;
    groups?: CollectionGroup[];
    isLoading?: boolean;
    pagination?: RegisterTablePaginationFacts;
    rowKey: (row: TRow) => string | number;
    rows: TRow[];
}

export interface RegisterTableModel<TRow> {
    emptyText: string;
    groupCards: RegisterGroupCardModel[];
    isEmpty: boolean;
    isLoading: boolean;
    pagination: RegisterTablePaginationFacts | null;
    rowKeys: Array<string | number>;
    rows: TRow[];
}

export function buildRegisterTableModel<TRow>({
    emptyText,
    groupPresentation,
    groups = [],
    isLoading = false,
    pagination,
    rowKey,
    rows,
}: RegisterTableDefinition<TRow>): RegisterTableModel<TRow> {
    return {
        emptyText,
        groupCards: buildRegisterGroupCards(groups, groupPresentation),
        isEmpty: rows.length === 0,
        isLoading,
        pagination: pagination ?? null,
        rowKeys: rows.map(rowKey),
        rows,
    };
}
