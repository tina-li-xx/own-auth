import { createOwnAuth } from "../../dist/index.js";
import { createD1Persistence, type D1DatabaseLike } from "../../dist/d1/index.js";
import { createOwnAuthScimHandler } from "../../dist/scim-http.js";
import { invokeConformanceRpc, readConformanceRpc } from "./worker-rpc.js";

const storageMethods = new Set([
  "commitProvision",
  "createConnection",
  "getUserById",
  "mutateUser"
]);

export async function handleScimStorageRpc(
  request: Request,
  database: D1DatabaseLike
): Promise<Response> {
  const rpc = await readConformanceRpc(request);
  return invokeConformanceRpc(
    createD1Persistence(database).storage.scimStorage,
    rpc,
    storageMethods
  );
}

export async function handleScimEngineQualification(
  database: D1DatabaseLike
): Promise<Response> {
  const auth = createOwnAuth({
    ...createD1Persistence(database),
    tokenPepper: "cloudflare-scim-qualification",
    scim: {}
  });

  try {
    const suffix = crypto.randomUUID();
    const owner = await auth.signUpEmailPassword({
      email: `scim-owner-${suffix}@example.com`,
      password: "correct-horse"
    });
    const { organisation } = await auth.createOrganisation({
      name: "SCIM Worker qualification",
      ownerUserId: owner.user.id
    });
    const connection = await auth.scim.createConnection({
      organisationId: organisation.id,
      actorUserId: owner.user.id,
      name: "Worker identity provider"
    });
    const token = await auth.scim.createToken({
      connectionId: connection.id,
      actorUserId: owner.user.id,
      name: "Worker qualification"
    });
    const handler = createOwnAuthScimHandler(auth);
    const createResponse = await scimRequest(handler, token.rawToken, "/Users", {
      method: "POST",
      body: {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        externalId: `worker-${suffix}`,
        userName: `scim-user-${suffix}@example.com`,
        displayName: "Worker SCIM user"
      }
    });
    const created = await createResponse.json() as { id?: string };
    const etag = createResponse.headers.get("etag");
    const getResponse = created.id
      ? await scimRequest(handler, token.rawToken, `/Users/${created.id}`)
      : null;
    const deleteResponse = created.id && etag
      ? await scimRequest(handler, token.rawToken, `/Users/${created.id}`, {
          method: "DELETE",
          headers: { "if-match": etag }
        })
      : null;
    const storedToken = await database.prepare(
      "select token_hash, prefix from own_auth_scim_tokens where id = ?1"
    ).bind(token.token.id).first<Record<string, string>>();

    return Response.json({
      userCreated: createResponse.status === 201 && Boolean(created.id) && etag === 'W/"1"',
      userRead: getResponse?.status === 200,
      userDeleted: deleteResponse?.status === 204,
      rawTokenNotStored: Boolean(storedToken) && !JSON.stringify(storedToken).includes(token.rawToken)
    });
  } finally {
    await auth.close();
  }
}

interface ScimRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function scimRequest(
  handler: ReturnType<typeof createOwnAuthScimHandler>,
  token: string,
  path: string,
  init: ScimRequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("content-type", "application/scim+json");
  return handler(new Request(`https://app.example.com/scim/v2${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  }));
}
