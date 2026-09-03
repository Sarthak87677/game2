import type { IncomingMessage, ServerResponse } from 'node:http';
export function syntheticOverpass(bbox: { south: number; west: number; north: number; east: number }): unknown;
export function parseBboxFromQuery(query: string): { south: number; west: number; north: number; east: number } | null;
export function fixtureMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void;
