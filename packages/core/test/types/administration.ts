import {
  createOwnAuth,
  InMemoryAuthStorage,
  type AdministrationAction
} from "../../src/index.js";

export const authWithAdministration = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "administration-type-test-pepper",
  administration: {
    authorize({ actor, action, targetUserId }) {
      const checkedAction: AdministrationAction = action;
      const checkedTarget: string | undefined = targetUserId;
      return actor.id.length > 0 && checkedAction.length > 0 && checkedTarget !== "blocked";
    }
  }
});

authWithAdministration.admin.listUsers({ actorUserId: "usr_actor" });
authWithAdministration.admin.getUser({ actorUserId: "usr_actor", userId: "usr_target" });

// @ts-expect-error Administration actions are a closed union.
const invalidAction: AdministrationAction = "users:delete";
void invalidAction;
