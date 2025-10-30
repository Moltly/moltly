# Moltly — Privacy Policy

Last updated: 2025-10-28

This Privacy Policy explains how Moltly (the “Service”) collects, uses, and shares information when you use moltly.xyz and any related applications or APIs.

Operator (Data Controller): Moltly
Contact: contact@moltly.xyz

If you deploy the Moltly software yourself, you are the data controller for your deployment. This Policy describes the hosted Service operated by the operator named above.

1) Information We Collect
- Account information: Email address, password (stored as a bcrypt hash), optional display name and profile image. If you sign in with Discord, Apple, or Google, we receive basic profile information from the provider (e.g., account identifier, email, avatar) and may store OAuth tokens required to facilitate sign‑in.
- Content you add: Molt and feeding entries (including specimen name, species, dates, stage, sizes, humidity/temperature, notes, reminders), photo attachments you upload, and research notebook data (stacks, notes, tags, and optional labels/descriptions).
- Technical and security data: Session cookies; limited IP address data derived from request headers for login rate limiting and security; basic request logs needed to operate the Service. Because we proxy the Service through Cloudflare (our CDN and security provider), Cloudflare also processes technical information necessary to deliver the Service and protect it, including your IP address, approximate location (e.g., country/region), User‑Agent, referrer, request identifiers (e.g., CF‑Ray), error and firewall events, and challenge/verification results used to distinguish bots from legitimate traffic.
- Guest mode data: If you use Moltly without signing in, entries and research notes you create in “guest mode” are stored only in your browser’s local storage and are not synced to our servers.

2) How We Use Information
- Provide and operate the Service, including syncing your data when signed in and rendering your content in the app.
- Authenticate users via email/password and OAuth providers (e.g., Discord, Apple, Google) and maintain session security.
- Protect the Service (e.g., rate limiting and detecting abusive behavior); we combine an email and an IP address to enforce short‑term sign‑in lockouts. We also use Cloudflare’s reverse proxy, CDN, and security features (including DDoS mitigation and web application firewall) to filter malicious traffic and keep the Service reliable.
- Improve the reliability and user experience of the Service.

3) Cookies and Local Storage
- Authentication cookies: We use necessary cookies to keep you signed in and to protect your account.
- Guest mode local storage: When not signed in, your entries and research notes are stored locally in your browser. Clearing your browser data will remove this information; we cannot recover it.
- Cloudflare security cookies: Cloudflare may set strictly necessary cookies or local storage entries to provide bot protection and maintain access after a security challenge (examples include `__cf_bm` and `cf_clearance`). These are essential for the Service to function securely.
- We do not use analytics cookies.

4) Legal Bases (EEA/UK Users)
Where GDPR/UK GDPR applies, we process personal data on these bases:
- Performance of a contract: To provide the Service you request.
- Legitimate interests: To keep the Service secure and reliable (e.g., rate limiting, preventing abuse), and to improve core functionality.
- Consent: Where required by law (for example, for optional features); you may withdraw consent at any time.

5) Sharing of Information
- Service providers: We use hosting and infrastructure providers to operate the Service and store data (e.g., a MongoDB database). These providers act on our behalf and follow our instructions.
- Network/CDN and security provider (Cloudflare): We route incoming and outgoing traffic through Cloudflare for content delivery, DDoS protection, and firewall services. Cloudflare processes technical and security data to provide these services and may temporarily cache content. Cloudflare acts as our service provider/processor. For details, see Cloudflare’s Privacy Policy: https://www.cloudflare.com/privacypolicy/ and Cloudflare Cookies: https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/
- Authentication providers: If you use Discord, Apple, or Google to sign in, we share and receive authentication data with that provider to facilitate login. Your use of each provider is subject to its own terms and privacy policy.
- Legal and safety: We may disclose information if required by law or to protect the rights, safety, and security of users, the public, or the Service.
- We do not sell personal information.

6) Data Retention
- Account‑linked data (entries, research, attachments) are retained while your account is active. You can delete your account in the app; this deletes your account and associated synced data (including entries and research stacks) from our database. OAuth account records associated with your sign‑in method may also be deleted as part of account deletion.
- Security rate‑limit data (email + IP pairing) is stored in memory only and automatically expires within minutes; lockouts typically last up to ~15 minutes.
- Guest mode data is stored only in your browser; we do not receive or retain it.
- Cloudflare logs and caches: Cloudflare maintains security logs, request metadata, and edge caches as needed to deliver and protect the Service. Cloudflare’s retention is governed by its own policies and service configuration; we do not extend Cloudflare’s retention beyond what the service provides. We access Cloudflare logs only for operations, troubleshooting, and security.

7) Security
- We use industry‑standard measures to protect your data, including hashing passwords with bcrypt and using HTTPS in production. We also use Cloudflare’s CDN and security features (e.g., TLS termination at the edge, DDoS mitigation, and a web application firewall) to help safeguard the Service. No method of transmission or storage is 100% secure.

8) Your Rights
Depending on your location, you may have rights to access, correct, port, or delete your personal data, and to object to or restrict certain processing. To exercise rights, contact us at contact@moltly.xyz You can also export or delete your synced data by deleting your account in the app. Guest mode data must be managed via your browser (e.g., clearing site data).

9) International Transfers
- We may process and store data in countries other than yours. Where required, we implement appropriate safeguards for international transfers (e.g., standard contractual clauses). Because Cloudflare operates a global network, your traffic may be routed through data centers outside your country to deliver and protect the Service.

10) Children’s Privacy
- The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, contact us to request deletion.

11) Changes to This Policy
- We may update this Policy from time to time. If changes are material, we will provide reasonable notice (e.g., in‑app notice or email, where appropriate). Continued use of the Service after an update signifies acceptance of the revised Policy.

12) Contact
- Questions or requests regarding this Policy: contact@moltly.xyz
Supplement: Product‑Specific Details
- Authentication: NextAuth handles email/password and OAuth sign‑in (e.g., Discord, Apple). With the MongoDB adapter enabled, OAuth account records (including provider identifiers and tokens) may be persisted to support sign‑in. We do not post content to these providers on your behalf.
- Entries and attachments: Molt entries, feeding logs, reminders, and photos you upload are stored with your account in our database when you are signed in.
- Research notebook: Stacks, notes (including titles, content, tags, and optional individual labels), and timestamps are stored with your account when signed in.
- Rate limiting: We derive an IP address from request headers and temporarily pair it with a normalized email to enforce sign‑in attempt limits. Records auto‑expire and are not persisted to long‑term storage.
- Network and CDN: Requests to and from the Service pass through Cloudflare. Cloudflare may add or process headers/identifiers such as CF‑Ray, CF‑Connecting‑IP, and CF‑IPCountry to route traffic and provide security. These are used solely to deliver and protect the Service and are not used for marketing.
