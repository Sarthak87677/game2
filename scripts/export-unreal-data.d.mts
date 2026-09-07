/** Type surface of scripts/export-unreal-data.mjs for the unit test (the script itself is plain ESM JavaScript). */
export const SCHEMA_VERSION: number;
export const OUTPUT_DIR: string;
export const SOURCE_ENTRY: string;

export interface TableSpec {
  file: string;
  rowStruct: string;
  sourceType: string;
  match(value: unknown): boolean;
  map(value: unknown): Record<string, unknown>;
}
export const TABLES: TableSpec[];

export interface ManifestTable {
  file: string;
  rowStruct: string;
  sourceType: string;
  sourceExports: string[];
  rows: number;
  status: 'exported' | 'missing-in-source';
}
export interface Manifest {
  schemaVersion: number;
  generator: string;
  sourceEntry: string;
  dataNote: string;
  tables: ManifestTable[];
}
export interface ExportResult {
  files: Record<string, unknown>;
  manifest: Manifest;
}

export function buildExport(dataModule: Record<string, unknown>): ExportResult;
export function serialize(value: unknown): string;
export function loadDataModule(root: string): Promise<Record<string, unknown>>;
export function writeExport(root: string, files: Record<string, unknown>, opts?: { check?: boolean }): string[];
