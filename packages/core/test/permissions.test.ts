import { describe, expect, it } from "vitest";
import {
  corePermissions,
  permissionsForRole,
  roleHasPermission
} from "../src/authorization.js";

describe("permissionsForRole", () => {
  it("gives owner all permissions", () => {
    const perms = permissionsForRole("owner");
    expect(perms).toEqual(corePermissions);
  });

  it("does not give admins owner-only permissions", () => {
    const perms = permissionsForRole("admin");
    expect(perms).not.toContain("manage_organisation");
    expect(perms).not.toContain("change_member_roles");
    expect(perms).toContain("invite_members");
    expect(perms).toContain("manage_api_keys");
    expect(perms).toHaveLength(7);
  });

  it("gives member only view_members", () => {
    const perms = permissionsForRole("member");
    expect(perms).toEqual(["view_members"]);
  });

  it("returns a copy, not the original array", () => {
    const a = permissionsForRole("owner");
    const b = permissionsForRole("owner");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("roleHasPermission", () => {
  it("owner has manage_organisation", () => {
    expect(roleHasPermission("owner", "manage_organisation")).toBe(true);
  });

  it("admin does not have manage_organisation", () => {
    expect(roleHasPermission("admin", "manage_organisation")).toBe(false);
  });

  it("member does not have invite_members", () => {
    expect(roleHasPermission("member", "invite_members")).toBe(false);
  });

  it("member has view_members", () => {
    expect(roleHasPermission("member", "view_members")).toBe(true);
  });

  it("owner has every permission", () => {
    for (const perm of corePermissions) {
      expect(roleHasPermission("owner", perm)).toBe(true);
    }
  });
});
