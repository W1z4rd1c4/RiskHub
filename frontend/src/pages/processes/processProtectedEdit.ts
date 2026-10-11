import type { Process } from '@/types/process';
/** The API projection is authoritative for active governed-mutation impact locks. */
export function processBusinessEditBlocked(process: Process | null | undefined): boolean {
    return process?.capabilities?.business_edit_blocked === true;
}
