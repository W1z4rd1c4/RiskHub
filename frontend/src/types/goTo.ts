export type GoToEntityType =
    | 'risk'
    | 'control'
    | 'kri'
    | 'issue'
    | 'vendor'
    | 'process'
    | 'asset'
    | 'threat';

export type GoToRecord = {
    entity_type: GoToEntityType;
    business_identifier: string | null;
    display_name: string;
    status: string;
    destination: string;
};
