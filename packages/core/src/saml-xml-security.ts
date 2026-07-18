import {
  parseDomFromString,
  xpath
} from "@node-saml/node-saml/lib/xml.js";
import { decodeBase64Url } from "./encoding.js";
import { SamlProtocolError } from "./saml-protocol-error.js";

const samlAssertionNamespace = "urn:oasis:names:tc:SAML:2.0:assertion";
const samlProtocolNamespace = "urn:oasis:names:tc:SAML:2.0:protocol";
const signatureNamespace = "http://www.w3.org/2000/09/xmldsig#";

const expectedNamespaces = new Map([
  ["Response", samlProtocolNamespace],
  ["Status", samlProtocolNamespace],
  ["StatusCode", samlProtocolNamespace],
  ["Assertion", samlAssertionNamespace],
  ["Issuer", samlAssertionNamespace],
  ["Subject", samlAssertionNamespace],
  ["NameID", samlAssertionNamespace],
  ["SubjectConfirmation", samlAssertionNamespace],
  ["SubjectConfirmationData", samlAssertionNamespace],
  ["Conditions", samlAssertionNamespace],
  ["AudienceRestriction", samlAssertionNamespace],
  ["Audience", samlAssertionNamespace],
  ["AuthnStatement", samlAssertionNamespace],
  ["AuthnContext", samlAssertionNamespace],
  ["AuthnContextClassRef", samlAssertionNamespace],
  ["AttributeStatement", samlAssertionNamespace],
  ["Attribute", samlAssertionNamespace],
  ["AttributeValue", samlAssertionNamespace],
  ["Signature", signatureNamespace],
  ["SignedInfo", signatureNamespace],
  ["SignatureMethod", signatureNamespace],
  ["DigestMethod", signatureNamespace],
  ["Reference", signatureNamespace]
]);

interface XmlDocument {
  documentElement: XmlElement;
}

interface XmlElement {
  childNodes: { readonly length: number; item(index: number): unknown };
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  localName: string;
  namespaceURI: string | null;
  nodeType: number;
}

export async function parseAndValidateSamlResponse(
  samlResponse: string,
  maxResponseBytes: number
): Promise<XmlElement> {
  const bytes = decodeSamlResponse(samlResponse);
  if (bytes.byteLength > maxResponseBytes) {
    throw invalid("SAML response exceeds the configured size limit");
  }
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw invalid("SAML response contains a forbidden document declaration");
  }

  let document: XmlDocument;
  try {
    document = (await parseDomFromString(xml)) as unknown as XmlDocument;
  } catch {
    throw invalid("SAML response is not valid XML");
  }
  const response = document.documentElement;
  if (
    response.localName !== "Response" ||
    response.namespaceURI !== samlProtocolNamespace
  ) {
    throw invalid("SAML response root is invalid");
  }

  validateElementNamespaces(response);
  validateUniqueIds(response);
  validateAlgorithms(response);
  const assertions = xpath.selectElements(
    response as unknown as Element,
    "./*[local-name()='Assertion' and namespace-uri()='urn:oasis:names:tc:SAML:2.0:assertion']"
  );
  if (assertions.length !== 1) {
    throw invalid("SAML response must contain exactly one assertion");
  }
  return response;
}

export async function parseVerifiedAssertion(xml: string): Promise<{
  assertionId: string;
  inResponseTo: string;
  recipient: string;
  expiresAt: Date;
}> {
  let document: XmlDocument;
  try {
    document = (await parseDomFromString(xml)) as unknown as XmlDocument;
  } catch {
    throw invalid("Verified SAML assertion is not valid XML");
  }
  const assertion = document.documentElement;
  if (
    assertion.localName !== "Assertion" ||
    assertion.namespaceURI !== samlAssertionNamespace
  ) {
    throw invalid("Verified SAML assertion is invalid");
  }
  validateElementNamespaces(assertion);
  validateUniqueIds(assertion);

  const assertionId = requiredAttribute(assertion, "ID");
  const confirmation = singleElement(
    assertion,
    ".//*[local-name()='SubjectConfirmationData' and namespace-uri()='urn:oasis:names:tc:SAML:2.0:assertion']"
  );
  const inResponseTo = requiredAttribute(confirmation, "InResponseTo");
  const recipient = requiredAttribute(confirmation, "Recipient");
  const expiresAt = parseTimestamp(requiredAttribute(confirmation, "NotOnOrAfter"));
  return { assertionId, inResponseTo, recipient, expiresAt };
}

export function requiredResponseAttribute(response: XmlElement, name: string): string {
  return requiredAttribute(response, name);
}

function decodeSamlResponse(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw invalid("SAML response is not valid base64");
  }
  try {
    return decodeBase64Url(value.replace(/\+/g, "-").replace(/\//g, "_"));
  } catch {
    throw invalid("SAML response is not valid base64");
  }
}

function validateElementNamespaces(root: XmlElement): void {
  visitElements(root, (element) => {
    const expected = expectedNamespaces.get(element.localName);
    if (expected && element.namespaceURI !== expected) {
      throw invalid(`SAML element ${element.localName} uses an invalid namespace`);
    }
  });
}

function validateUniqueIds(root: XmlElement): void {
  const ids = new Set<string>();
  visitElements(root, (element) => {
    for (const name of ["ID", "Id", "id"]) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name)?.trim() ?? "";
      if (!value || ids.has(value)) {
        throw invalid("SAML response contains an invalid or duplicate ID");
      }
      ids.add(value);
    }
  });
}

function validateAlgorithms(root: XmlElement): void {
  visitElements(root, (element) => {
    if (element.namespaceURI !== signatureNamespace) return;
    const algorithm = element.getAttribute("Algorithm")?.toLowerCase();
    if (element.localName === "SignatureMethod") {
      if (algorithm?.includes("sha1")) throw unsupportedAlgorithm();
      if (
        algorithm !== "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" &&
        algorithm !== "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"
      ) {
        throw unsupportedAlgorithm();
      }
    }
    if (element.localName === "DigestMethod") {
      if (algorithm?.includes("sha1")) throw unsupportedAlgorithm();
      if (
        algorithm !== "http://www.w3.org/2001/04/xmlenc#sha256" &&
        algorithm !== "http://www.w3.org/2001/04/xmlenc#sha512"
      ) {
        throw unsupportedAlgorithm();
      }
    }
  });
}

function visitElements(root: XmlElement, visit: (element: XmlElement) => void): void {
  visit(root);
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const child = root.childNodes.item(index) as XmlElement | null;
    if (child?.nodeType === 1) visitElements(child, visit);
  }
}

function singleElement(root: XmlElement, query: string): XmlElement {
  const elements = xpath.selectElements(root as unknown as Element, query);
  if (elements.length !== 1) {
    throw invalid("SAML assertion contains ambiguous subject confirmation data");
  }
  return elements[0] as unknown as XmlElement;
}

function requiredAttribute(element: XmlElement, name: string): string {
  const value = element.getAttribute(name)?.trim();
  if (!value) throw invalid(`SAML ${name} is required`);
  return value;
}

function parseTimestamp(value: string): Date {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw invalid("SAML response contains an invalid timestamp");
  }
  return timestamp;
}

function unsupportedAlgorithm(): SamlProtocolError {
  return new SamlProtocolError(
    "saml_signature_algorithm_unsupported",
    "SAML response uses an unsupported signature algorithm"
  );
}

function invalid(message: string): SamlProtocolError {
  return new SamlProtocolError("saml_response_invalid", message);
}
