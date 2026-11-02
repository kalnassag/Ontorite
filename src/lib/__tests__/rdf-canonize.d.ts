declare module "rdf-canonize" {
  export function canonize(
    input: string,
    options: { algorithm: "RDFC-1.0"; inputFormat: "application/n-quads" },
  ): Promise<string>;
}
