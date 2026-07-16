import type {
  AuditEventFilter,
  ListUsersFilter,
  StoragePageCursor
} from "./storage.js";

type AdministrationQueryDialect = "d1" | "postgres";

interface AdministrationQuery {
  sql: string;
  params: unknown[];
}

export function buildUserListQuery(
  columns: string,
  filter: ListUsersFilter | undefined,
  dialect: AdministrationQueryDialect
): AdministrationQuery {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.query) {
    const query = bind(params, filter.query, dialect);
    const length = dialect === "postgres" ? `char_length(${query})` : `length(${query})`;
    clauses.push(
      `(lower(substr(coalesce(email, ''), 1, ${length})) = lower(${query}) ` +
      `or lower(substr(coalesce(name, ''), 1, ${length})) = lower(${query}))`
    );
  }
  if (filter?.status === "active") clauses.push("disabled_at is null");
  if (filter?.status === "disabled") clauses.push("disabled_at is not null");
  addCursor(clauses, params, filter?.cursor, dialect);
  const where = clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "";
  const limit = addLimit(params, filter?.limit, dialect);
  return {
    sql: `${columns} from own_auth_users${where} order by created_at desc, id desc${limit}`,
    params
  };
}

export function buildAuditEventListQuery(
  columns: string,
  filter: AuditEventFilter | undefined,
  dialect: AdministrationQueryDialect
): AdministrationQuery {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.userId) {
    const userId = bind(params, filter.userId, dialect);
    clauses.push(`(actor_user_id = ${userId} or target_user_id = ${userId})`);
  }
  if (filter?.organisationId) {
    clauses.push(`organisation_id = ${bind(params, filter.organisationId, dialect)}`);
  }
  if (filter?.apiKeyId) {
    clauses.push(`api_key_id = ${bind(params, filter.apiKeyId, dialect)}`);
  }
  addCursor(clauses, params, filter?.cursor, dialect);
  const where = clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "";
  const limit = addLimit(params, filter?.limit, dialect);
  return {
    sql: `${columns} from own_auth_audit_events${where} ` +
      `order by created_at desc, id desc${limit}`,
    params
  };
}

function addCursor(
  clauses: string[],
  params: unknown[],
  cursor: StoragePageCursor | undefined,
  dialect: AdministrationQueryDialect
): void {
  if (!cursor) return;
  const createdAt = bind(
    params,
    dialect === "d1" ? cursor.createdAt.getTime() : cursor.createdAt,
    dialect
  );
  const id = bind(params, cursor.id, dialect);
  clauses.push(`(created_at < ${createdAt} or (created_at = ${createdAt} and id < ${id}))`);
}

function addLimit(
  params: unknown[],
  limit: number | undefined,
  dialect: AdministrationQueryDialect
): string {
  return limit === undefined ? "" : ` limit ${bind(params, limit, dialect)}`;
}

function bind(
  params: unknown[],
  value: unknown,
  dialect: AdministrationQueryDialect
): string {
  params.push(value);
  return dialect === "postgres" ? `$${params.length}` : `?${params.length}`;
}
