export function cloneStored<T>(value: T): T {
  return structuredClone(value);
}

export function findStored<T>(
  store: ReadonlyMap<string, T>,
  predicate: (value: T) => boolean
): T | null {
  for (const value of store.values()) {
    if (predicate(value)) {
      return cloneStored(value);
    }
  }

  return null;
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

  const updated = cloneStored({ ...existing, ...patch, id: existing.id });
  store.set(id, updated);
  return cloneStored(updated);
}
