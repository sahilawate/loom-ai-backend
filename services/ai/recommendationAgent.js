export function rankVariants(variants) {
  if (!variants || variants.length === 0) return [];
  return variants.slice(0, 3);
}
