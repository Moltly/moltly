const atobSafe = (input: string) => {
  if (typeof atob === "function") return atob(input);
  return Buffer.from(input, "base64").toString("binary");
};

const btoaSafe = (input: string) => {
  if (typeof btoa === "function") return btoa(input);
  return Buffer.from(input, "binary").toString("base64");
};

export function base64urlToBuffer(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atobSafe(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoaSafe(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeRequestOptions(options: any) {
  if (!options) return options;
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: base64urlToBuffer(cred.id),
        }))
      : undefined,
  };
}

export function decodeCreationOptions(options: any) {
  if (!options) return options;
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const userId: string = typeof options.user?.id === "string" ? options.user.id : String(options.user.id ?? "");
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: encoder
        ? encoder.encode(userId)
        : Uint8Array.from(userId, (c: string) => c.charCodeAt(0)),
    },
    excludeCredentials: Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials.map((cred: any) => ({
          ...cred,
          id: base64urlToBuffer(cred.id),
        }))
      : undefined,
  };
}

export function serializePublicKeyCredential(cred: PublicKeyCredential): any {
  const response = cred.response as AuthenticatorAssertionResponse | AuthenticatorAttestationResponse;
  const base: any = {
    id: cred.id,
    type: cred.type,
    rawId: bufferToBase64url(cred.rawId),
    authenticatorAttachment: cred.authenticatorAttachment,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    response: {},
  };

  if ("attestationObject" in response) {
    base.response = {
      attestationObject: bufferToBase64url(response.attestationObject),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      transports: (response as any).transports ?? [],
    };
  } else {
    base.response = {
      authenticatorData: bufferToBase64url((response as AuthenticatorAssertionResponse).authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
    };
  }

  return base;
}
