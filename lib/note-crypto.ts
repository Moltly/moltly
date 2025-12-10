/**
 * End-to-end encryption utilities for notebook notes.
 * Uses Web Crypto API with AES-256-GCM for encryption.
 * Encryption/decryption happens entirely client-side.
 */

// Storage key for cached password hash in sessionStorage
const PASSWORD_CACHE_KEY = "moltly_e2e_pw_hash";

/**
 * Derive an AES-256 key from a password using PBKDF2.
 */
export async function deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import the password as a key for PBKDF2
    const baseKey = await crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    // Derive the AES key
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
            iterations: 100000,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Generate a random salt for key derivation.
 */
export function generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Generate a random initialization vector for AES-GCM.
 */
export function generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Convert Uint8Array to base64 string.
 */
export function uint8ArrayToBase64(array: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < array.length; i++) {
        binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return array;
}

/**
 * Encrypt text content using AES-256-GCM.
 * Returns encrypted data with salt and IV for storage.
 */
export async function encryptContent(
    plaintext: string,
    password: string
): Promise<{ ciphertext: string; salt: string; iv: string }> {
    const encoder = new TextEncoder();
    const salt = generateSalt();
    const iv = generateIV();
    const key = await deriveKeyFromPassword(password, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
        key,
        encoder.encode(plaintext)
    );

    return {
        ciphertext: uint8ArrayToBase64(new Uint8Array(encrypted)),
        salt: uint8ArrayToBase64(salt),
        iv: uint8ArrayToBase64(iv),
    };
}

/**
 * Decrypt content using AES-256-GCM.
 * Requires the same salt and IV used during encryption.
 */
export async function decryptContent(
    ciphertext: string,
    password: string,
    salt: string,
    iv: string
): Promise<string> {
    const decoder = new TextDecoder();
    const saltArray = base64ToUint8Array(salt);
    const ivArray = base64ToUint8Array(iv);
    const ciphertextArray = base64ToUint8Array(ciphertext);

    const key = await deriveKeyFromPassword(password, saltArray);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivArray.buffer.slice(ivArray.byteOffset, ivArray.byteOffset + ivArray.byteLength) as ArrayBuffer },
        key,
        ciphertextArray.buffer.slice(ciphertextArray.byteOffset, ciphertextArray.byteOffset + ciphertextArray.byteLength) as ArrayBuffer
    );

    return decoder.decode(decrypted);
}

/**
 * Encrypt a note's sensitive fields (title and content).
 * Returns the encrypted data ready for storage.
 */
export async function encryptNote(
    title: string,
    content: string,
    password: string
): Promise<{
    encryptedTitle: string;
    encryptedContent: string;
    salt: string;
    iv: string;
}> {
    // Use the same salt and IV for both fields to simplify
    const salt = generateSalt();
    const iv = generateIV();
    const key = await deriveKeyFromPassword(password, salt);
    const encoder = new TextEncoder();

    // Encrypt title
    const encryptedTitleBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
        key,
        encoder.encode(title)
    );

    // Encrypt content with a different IV for security
    const contentIV = generateIV();
    const encryptedContentBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: contentIV.buffer.slice(contentIV.byteOffset, contentIV.byteOffset + contentIV.byteLength) as ArrayBuffer },
        key,
        encoder.encode(content)
    );

    return {
        encryptedTitle: uint8ArrayToBase64(new Uint8Array(encryptedTitleBuffer)),
        encryptedContent: `${uint8ArrayToBase64(contentIV)}:${uint8ArrayToBase64(new Uint8Array(encryptedContentBuffer))}`,
        salt: uint8ArrayToBase64(salt),
        iv: uint8ArrayToBase64(iv),
    };
}

/**
 * Decrypt a note's sensitive fields (title and content).
 */
export async function decryptNote(
    encryptedTitle: string,
    encryptedContent: string,
    password: string,
    salt: string,
    iv: string
): Promise<{ title: string; content: string }> {
    const saltArray = base64ToUint8Array(salt);
    const ivArray = base64ToUint8Array(iv);
    const key = await deriveKeyFromPassword(password, saltArray);
    const decoder = new TextDecoder();

    // Decrypt title
    const encryptedTitleArray = base64ToUint8Array(encryptedTitle);
    const titleBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivArray.buffer.slice(ivArray.byteOffset, ivArray.byteOffset + ivArray.byteLength) as ArrayBuffer },
        key,
        encryptedTitleArray.buffer.slice(encryptedTitleArray.byteOffset, encryptedTitleArray.byteOffset + encryptedTitleArray.byteLength) as ArrayBuffer
    );

    // Decrypt content (has its own IV prepended)
    const [contentIVBase64, contentCiphertext] = encryptedContent.split(":");
    const contentIV = base64ToUint8Array(contentIVBase64);
    const contentCiphertextArray = base64ToUint8Array(contentCiphertext);
    const contentBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: contentIV.buffer.slice(contentIV.byteOffset, contentIV.byteOffset + contentIV.byteLength) as ArrayBuffer },
        key,
        contentCiphertextArray.buffer.slice(contentCiphertextArray.byteOffset, contentCiphertextArray.byteOffset + contentCiphertextArray.byteLength) as ArrayBuffer
    );

    return {
        title: decoder.decode(titleBuffer),
        content: decoder.decode(contentBuffer),
    };
}

/**
 * Hash password for session caching (not for security, just for quick comparison).
 */
export async function hashPasswordForCache(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return uint8ArrayToBase64(new Uint8Array(hashBuffer));
}

/**
 * Cache the password hash in sessionStorage.
 */
export function cachePasswordHash(hash: string): void {
    if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(PASSWORD_CACHE_KEY, hash);
    }
}

/**
 * Get cached password hash from sessionStorage.
 */
export function getCachedPasswordHash(): string | null {
    if (typeof sessionStorage !== "undefined") {
        return sessionStorage.getItem(PASSWORD_CACHE_KEY);
    }
    return null;
}

/**
 * Clear cached password hash.
 */
export function clearCachedPasswordHash(): void {
    if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(PASSWORD_CACHE_KEY);
    }
}

/**
 * Check if we have a cached password that matches.
 */
export async function verifyCachedPassword(password: string): Promise<boolean> {
    const cached = getCachedPasswordHash();
    if (!cached) return false;
    const hash = await hashPasswordForCache(password);
    return hash === cached;
}
