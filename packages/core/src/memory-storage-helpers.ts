export function cloneStored<T>(value: T): T {
  return structuredClone(value);
}

export function updateStoredEntity<T extends { id: string }>(
  store: Map<string, T>,
  id: string,
  patch: Partial<T>
): T | null {
  const existing = store.get(id);
  if (!existing) {
    return null;
  }

  const updated = cloneStored({ ...existing, ...patch });
  store.set(id, updated);
  return cloneStored(updated);
}
