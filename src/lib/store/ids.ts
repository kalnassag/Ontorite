/** Short random ID for entities and ontologies (8 hex chars). */
export const genId = (): string => crypto.randomUUID().slice(0, 8);

/** Current time as an ISO 8601 string (dcterms:created / modified). */
export const nowIso = (): string => new Date().toISOString();
