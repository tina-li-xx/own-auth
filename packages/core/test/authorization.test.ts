import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStorage,
  MemoryEmailProvider,
  createOwnAuth,
  defineOwnAuthAuthorization,
  type OwnAuth
} from "../src/index.js";

const authorization = defineOwnAuthAuthorization({
  permissions: ["documents:read", "documents:write"],
  roles: {
    reviewer: ["view_members", "documents:read"],
    manager: [
      "view_members",
      "invite_members",
      "remove_members",
      "change_member_roles",
      "documents:read",
      "documents:write"
    ]
  }
});

function configuredAuth(storage = new InMemoryAuthStorage()) {
  return createOwnAuth({
    storage,
    emailProvider: new MemoryEmailProvider(),
    tokenPepper: "custom-authorization-test-pepper",
    exposeRawTokens: true,
    authorization
  });
}

async function createOrganisationHarness() {
  const storage = new InMemoryAuthStorage();
  const auth = configuredAuth(storage);
  const owner = await auth.createUser({ email: "owner@example.com" });
  const { organisation } = await auth.createOrganisation({
    name: "Example",
    ownerUserId: owner.id
  });
  return { auth, storage, owner, organisation };
}

describe("application-defined organisation authorization", () => {
  it("grants configured permissions only inside the member's organisation", async () => {
    const { auth, owner, organisation } = await createOrganisationHarness();
    const reviewer = await auth.createUser({ email: "reviewer@example.com" });
    const otherOwner = await auth.createUser({ email: "other-owner@example.com" });
    const { organisation: otherOrganisation } = await auth.createOrganisation({
      name: "Other",
      ownerUserId: otherOwner.id
    });
    const invitation = await auth.inviteMember({
      organisationId: organisation.id,
      invitedByUserId: owner.id,
      email: reviewer.email ?? "",
      role: "reviewer"
    });

    await auth.acceptInvite({ token: invitation.token ?? "", userId: reviewer.id });

    await expect(
      auth.checkPermission(organisation.id, reviewer.id, "documents:read")
    ).resolves.toBe(true);
    await expect(
      auth.checkPermission(organisation.id, reviewer.id, "documents:write")
    ).resolves.toBe(false);
    await expect(
      auth.checkPermission(otherOrganisation.id, reviewer.id, "documents:read")
    ).resolves.toBe(false);
    await expect(
      auth.checkPermission(organisation.id, owner.id, "documents:write")
    ).resolves.toBe(true);
  });

  it("keeps owner promotion, demotion, and removal owner-only", async () => {
    const { auth, owner, organisation } = await createOrganisationHarness();
    const manager = await auth.createUser({ email: "manager@example.com" });
    const member = await auth.createUser({ email: "member@example.com" });

    for (const [user, role] of [
      [manager, "manager"],
      [member, "member"]
    ] as const) {
      const invitation = await auth.inviteMember({
        organisationId: organisation.id,
        invitedByUserId: owner.id,
        email: user.email ?? "",
        role
      });
      await auth.acceptInvite({ token: invitation.token ?? "", userId: user.id });
    }

    await expect(auth.changeMemberRole({
      organisationId: organisation.id,
      actorUserId: manager.id,
      userId: member.id,
      role: "reviewer"
    })).resolves.toMatchObject({ role: "reviewer" });
    await expect(auth.changeMemberRole({
      organisationId: organisation.id,
      actorUserId: manager.id,
      userId: owner.id,
      role: "member"
    })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(auth.changeMemberRole({
      organisationId: organisation.id,
      actorUserId: manager.id,
      userId: member.id,
      role: "owner"
    })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(auth.removeMember({
      organisationId: organisation.id,
      actorUserId: manager.id,
      userId: owner.id
    })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(auth.inviteMember({
      organisationId: organisation.id,
      invitedByUserId: manager.id,
      email: "future-owner@example.com",
      role: "owner"
    })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("fails closed for removed roles without consuming stale invitations", async () => {
    const storage = new InMemoryAuthStorage();
    const configured = configuredAuth(storage);
    const owner = await configured.createUser({ email: "removed-role-owner@example.com" });
    const invited = await configured.createUser({ email: "removed-role-user@example.com" });
    const { organisation } = await configured.createOrganisation({
      name: "Removed Role",
      ownerUserId: owner.id
    });
    const acceptedInvitation = await configured.inviteMember({
      organisationId: organisation.id,
      invitedByUserId: owner.id,
      email: invited.email ?? "",
      role: "reviewer"
    });
    await configured.acceptInvite({
      token: acceptedInvitation.token ?? "",
      userId: invited.id
    });

    const pendingUser = await configured.createUser({ email: "stale-invite@example.com" });
    const pendingInvitation = await configured.inviteMember({
      organisationId: organisation.id,
      invitedByUserId: owner.id,
      email: pendingUser.email ?? "",
      role: "reviewer"
    });
    const withoutCustomRoles = createOwnAuth({
      storage,
      emailProvider: new MemoryEmailProvider(),
      tokenPepper: "custom-authorization-test-pepper",
      exposeRawTokens: true
    });

    await expect(
      withoutCustomRoles.checkPermission(organisation.id, invited.id, "view_members")
    ).resolves.toBe(false);
    await expect(
      withoutCustomRoles.requirePermission(organisation.id, invited.id, "view_members")
    ).rejects.toMatchObject({ code: "role_not_configured" });
    await expect(withoutCustomRoles.acceptInvite({
      token: pendingInvitation.token ?? "",
      userId: pendingUser.id
    })).rejects.toMatchObject({ code: "role_not_configured" });
    await expect(configured.acceptInvite({
      token: pendingInvitation.token ?? "",
      userId: pendingUser.id
    })).resolves.toMatchObject({ member: { role: "reviewer" } });
  });

  it("rejects unconfigured roles before creating an invitation", async () => {
    const { auth, storage, owner, organisation } = await createOrganisationHarness();
    const runtimeAuth = auth as unknown as OwnAuth<string, string>;

    await expect(runtimeAuth.inviteMember({
      organisationId: organisation.id,
      invitedByUserId: owner.id,
      email: "unknown-role@example.com",
      role: "unknown"
    })).rejects.toMatchObject({ code: "role_not_configured" });
    await expect(
      storage.getPendingInvitationByOrganisationAndEmail(
        organisation.id,
        "unknown-role@example.com"
      )
    ).resolves.toBeNull();
  });

  it("rejects invalid, reserved, duplicate, and unresolved definitions", () => {
    expect(() => defineOwnAuthAuthorization({
      permissions: ["documents:read"],
      roles: { owner: ["documents:read"] }
    })).toThrow("authorization role owner is reserved");
    expect(() => defineOwnAuthAuthorization({
      permissions: ["view_members"],
      roles: {}
    })).toThrow("authorization permission view_members is reserved");
    expect(() => defineOwnAuthAuthorization({
      permissions: ["documents:read", "documents:read"],
      roles: {}
    })).toThrow("authorization permission documents:read is duplicated");
    expect(() => defineOwnAuthAuthorization({
      permissions: ["documents:read"],
      roles: { reviewer: ["documents:write"] }
    })).toThrow("references unconfigured permission documents:write");
    expect(() => defineOwnAuthAuthorization({
      permissions: ["Documents:Read"],
      roles: {}
    })).toThrow("authorization permission Documents:Read is invalid");
  });
});
