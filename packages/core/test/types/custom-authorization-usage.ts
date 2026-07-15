import {
  configuredAuth,
  inlineConfiguredAuth
} from "./custom-authorization-config.js";
import {
  createOwnAuth,
  createOwnAuthHandler,
  InMemoryAuthStorage
} from "../../src/index.js";

const invitationInput = {
  organisationId: "org_type_contract",
  email: "user@example.com",
  invitedByUserId: "usr_type_contract"
};

void configuredAuth.inviteMember({ ...invitationInput, role: "reviewer" });
void configuredAuth.changeMemberRole({
  organisationId: invitationInput.organisationId,
  actorUserId: invitationInput.invitedByUserId,
  userId: "usr_target",
  role: "editor"
});
void configuredAuth.checkPermission(
  invitationInput.organisationId,
  invitationInput.invitedByUserId,
  "documents:read"
);
void inlineConfiguredAuth.inviteMember({ ...invitationInput, role: "analyst" });
void inlineConfiguredAuth.requirePermission(
  invitationInput.organisationId,
  invitationInput.invitedByUserId,
  "reports:read"
);
void createOwnAuthHandler(configuredAuth);
void createOwnAuthHandler(createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "default-type-contract-pepper"
}));

// @ts-expect-error reviewer is configured, approver is not
void configuredAuth.inviteMember({ ...invitationInput, role: "approver" });
void configuredAuth.checkPermission(
  invitationInput.organisationId,
  invitationInput.invitedByUserId,
  // @ts-expect-error permissions are inferred from the authorization definition
  "documents:delete"
);
void inlineConfiguredAuth.changeMemberRole({
  organisationId: invitationInput.organisationId,
  actorUserId: invitationInput.invitedByUserId,
  userId: "usr_target",
  // @ts-expect-error inline definitions must retain their literal role union
  role: "reviewer"
});
