export type DatabaseRow = Record<string, unknown>;

export type EntityColumnMap<Entity> = Record<keyof Entity & string, string>;

export function databaseColumnEntries<Entity>(
  columns: EntityColumnMap<Entity>,
  entity: Partial<Entity>
): Array<[keyof Entity & string, string]> {
  return (Object.entries(columns) as Array<[keyof Entity & string, string]>).filter(
    ([key]) => entity[key] !== undefined
  );
}

export function databaseColumnList<Entity>(columns: EntityColumnMap<Entity>): string {
  return Object.values(columns).join(", ");
}
