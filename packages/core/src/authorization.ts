import {
  builtInOrganisationRoles,
  type BuiltInOrganisationRole
} from "./types.js";

export const corePermissions = [
  "manage_organisation",
  "invite_members",
  "remove_members",
  "change_member_roles",
  "view_members",
  "view_audit_events",
  "manage_sessions",
  "manage_api_keys",
  "manage_basic_settings"
] as const;

export type CorePermission = (typeof corePermissions)[number];
export type Permission<CustomPermission extends string = never> =
  | CorePermission
  | CustomPermission;

export interface OwnAuthAuthorizationDefinition<
  CustomPermission extends string = never,
  CustomRole extends string = never
> {
  readonly permissions: readonly CustomPermission[];
  readonly roles: Readonly<
    Record<CustomRole, readonly Permission<CustomPermission>[]>
  >;
}

export type AnyOwnAuthAuthorizationDefinition = OwnAuthAuthorizationDefinition<
  string,
  string
>;

export type AuthorizationCustomPermission<Definition> =
  Definition extends OwnAuthAuthorizationDefinition<
    infer CustomPermission,
    infer _CustomRole
  >
    ? CustomPermission
    : never;

export type AuthorizationCustomRole<Definition> =
  Definition extends OwnAuthAuthorizationDefinition<
    infer _CustomPermission,
    infer CustomRole
  >
    ? CustomRole
    : never;

export interface AuthorizationRegistry {
  hasRole(role: string): boolean;
  hasPermission(role: string, permission: string): boolean;
}

export const organisationRolePattern = "^[a-z][a-z0-9_-]{0,63}$";

const builtInRoleSet = new Set<string>(builtInOrganisationRoles);
const corePermissionSet = new Set<string>(corePermissions);
const roleIdentifier = new RegExp(organisationRolePattern);
const permissionIdentifier = /^[a-z][a-z0-9_.:-]{0,127}$/;

const builtInRolePermissions: Record<BuiltInOrganisationRole, readonly CorePermission[]> = {
  owner: corePermissions,
  admin: [
    "invite_members",
    "remove_members",
    "view_members",
    "view_audit_events",
    "manage_sessions",
    "manage_api_keys",
    "manage_basic_settings"
  ],
  member: ["view_members"]
};

export function defineOwnAuthAuthorization<
  const Permissions extends readonly string[],
  const Roles extends Readonly<
    Record<string, readonly (CorePermission | Permissions[number])[]>
  >
>(definition: {
  permissions: Permissions;
  roles: Roles;
}): OwnAuthAuthorizationDefinition<Permissions[number], keyof Roles & string> {
  validateAuthorizationDefinition(definition);
  return Object.freeze({
    permissions: Object.freeze([...definition.permissions]),
    roles: Object.freeze(
      Object.fromEntries(
        Object.entries(definition.roles).map(([role, permissions]) => [
          role,
          Object.freeze([...permissions])
        ])
      )
    )
  }) as OwnAuthAuthorizationDefinition<Permissions[number], keyof Roles & string>;
}

export function createAuthorizationRegistry(
  definition?: AnyOwnAuthAuthorizationDefinition
): AuthorizationRegistry {
  if (definition) {
    validateAuthorizationDefinition(definition);
  }

  const customPermissions = definition?.permissions ?? [];
  const allPermissions = new Set<string>([...corePermissions, ...customPermissions]);
  const rolePermissions = new Map<string, ReadonlySet<string>>();

  for (const role of builtInOrganisationRoles) {
    rolePermissions.set(
      role,
      new Set(role === "owner" ? allPermissions : builtInRolePermissions[role])
    );
  }
  for (const [role, permissions] of Object.entries(definition?.roles ?? {})) {
    rolePermissions.set(role, new Set(permissions));
  }

  return Object.freeze({
    hasRole(role: string): boolean {
      return rolePermissions.has(role);
    },
    hasPermission(role: string, permission: string): boolean {
      return rolePermissions.get(role)?.has(permission) ?? false;
    }
  });
}

export function permissionsForRole(role: BuiltInOrganisationRole): CorePermission[] {
  return [...builtInRolePermissions[role]];
}

export function roleHasPermission(
  role: BuiltInOrganisationRole,
  permission: CorePermission
): boolean {
  return builtInRolePermissions[role].includes(permission);
}

function validateAuthorizationDefinition(
  definition: AnyOwnAuthAuthorizationDefinition
): void {
  const customPermissions = new Set<string>();
  for (const permission of definition.permissions) {
    validateIdentifier(permission, permissionIdentifier, "permission");
    if (corePermissionSet.has(permission)) {
      throw new Error(`authorization permission ${permission} is reserved by Own Auth`);
    }
    if (customPermissions.has(permission)) {
      throw new Error(`authorization permission ${permission} is duplicated`);
    }
    customPermissions.add(permission);
  }

  for (const [role, permissions] of Object.entries(definition.roles)) {
    validateIdentifier(role, roleIdentifier, "role");
    if (builtInRoleSet.has(role)) {
      throw new Error(`authorization role ${role} is reserved by Own Auth`);
    }
    const rolePermissionSet = new Set<string>();
    for (const permission of permissions) {
      if (!corePermissionSet.has(permission) && !customPermissions.has(permission)) {
        throw new Error(
          `authorization role ${role} references unconfigured permission ${permission}`
        );
      }
      if (rolePermissionSet.has(permission)) {
        throw new Error(
          `authorization role ${role} contains duplicate permission ${permission}`
        );
      }
      rolePermissionSet.add(permission);
    }
  }
}

function validateIdentifier(
  value: string,
  pattern: RegExp,
  label: "permission" | "role"
): void {
  if (!pattern.test(value)) {
    throw new Error(`authorization ${label} ${value} is invalid`);
  }
}
