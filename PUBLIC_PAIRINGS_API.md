# Moltly Public Pairings API

Base URL: `https://moltly.xyz`

This API exposes Moltly pairing advertisements as a public, read-only JSON feed for third-party websites, apps, and integrations.

## Overview

- Authentication: none
- Access: public read-only
- Response format: JSON
- CORS: enabled with `Access-Control-Allow-Origin: *`
- Supported methods: `GET`, `OPTIONS`
- Content type: `application/json`

Only live public pairing ads are included. Listings without a configured public contact method are not returned.

## Endpoints

### List Pairing Ads

`GET https://moltly.xyz/api/public/pairings`

Returns the public collection feed of pairing advertisements.

### Get Pairing Ad by ID

`GET https://moltly.xyz/api/public/pairings/{id}`

Returns one public pairing advertisement by `specimenId`.

## Query Parameters

The collection endpoint supports these query parameters:

| Parameter | Type | Description |
| --- | --- | --- |
| `species` | string | Exact species match, case-insensitive. Example: `Grammostola pulchra` |
| `status` | string | Filter by pairing status: `seeking_male`, `seeking_female`, `open_to_offers` |
| `sex` | string | Filter by specimen sex: `Male`, `Female`, `Unknown`, `Unsexed` |
| `ownerId` | string | Filter by Moltly owner user ID |
| `search` | string | Case-insensitive text search across specimen name, species, owner name, username, contact value, pairing notes, and notes |
| `limit` | integer | Page size. Default `50`, maximum `100` |
| `offset` | integer | Zero-based row offset |
| `page` | integer | One-based page number. Used only when `offset` is not supplied |

## Pagination

Pagination applies only to `GET /api/public/pairings`.

- Default `limit`: `50`
- Maximum `limit`: `100`
- Default `page`: `1`
- `offset` takes precedence over `page`

Example:

```text
GET https://moltly.xyz/api/public/pairings?limit=25&page=2
GET https://moltly.xyz/api/public/pairings?limit=25&offset=25
```

## Collection Response

### Example Request

```bash
curl "https://moltly.xyz/api/public/pairings?status=seeking_female&species=Grammostola%20pulchra&limit=10"
```

### Example Response

```json
{
  "data": [
    {
      "listingId": "67dff0db3e1c6f4d1f7f8abc",
      "specimenId": "67dff0db3e1c6f4d1f7f8abc",
      "specimenName": "Nyx",
      "species": "Grammostola pulchra",
      "sex": "Male",
      "imageUrl": "https://moltly.xyz/api/image?url=https%3A%2F%2Fmoltly-uploads.example%2Fmolt-uploads%2Fabc%2Fcover.jpg",
      "notes": "Calm temperament, proven feeder.",
      "pairingStatus": "seeking_female",
      "pairingNotes": "Fresh mature male, last molt 2026-02-03.",
      "createdAt": "2026-02-10T18:32:11.000Z",
      "updatedAt": "2026-03-21T08:15:44.000Z",
      "owner": {
        "id": "67c111223344556677889900",
        "name": "arachnokeeper",
        "username": "arachnokeeper",
        "imageUrl": "https://moltly.xyz/avatar.png"
      },
      "contact": {
        "method": "discord",
        "value": "arachnokeeper#1234",
        "notes": "Messages preferred in the evening."
      },
      "attachments": [
        {
          "kind": "attachment",
          "name": "pedipalp-closeup.jpg",
          "type": "image/jpeg",
          "url": "https://moltly.xyz/api/image?url=https%3A%2F%2Fmoltly-uploads.example%2Fmolt-uploads%2Fabc%2Fpedipalp-closeup.jpg",
          "originalUrl": "https://moltly-uploads.example/molt-uploads/abc/pedipalp-closeup.jpg",
          "addedAt": "2026-03-18T12:10:33.000Z"
        }
      ],
      "images": [
        {
          "kind": "cover",
          "name": "Nyx",
          "type": "image",
          "url": "https://moltly.xyz/api/image?url=https%3A%2F%2Fmoltly-uploads.example%2Fmolt-uploads%2Fabc%2Fcover.jpg",
          "originalUrl": "https://moltly-uploads.example/molt-uploads/abc/cover.jpg"
        },
        {
          "kind": "attachment",
          "name": "pedipalp-closeup.jpg",
          "type": "image/jpeg",
          "url": "https://moltly.xyz/api/image?url=https%3A%2F%2Fmoltly-uploads.example%2Fmolt-uploads%2Fabc%2Fpedipalp-closeup.jpg",
          "originalUrl": "https://moltly-uploads.example/molt-uploads/abc/pedipalp-closeup.jpg",
          "addedAt": "2026-03-18T12:10:33.000Z"
        }
      ],
      "urls": {
        "api": "https://moltly.xyz/api/public/pairings/67dff0db3e1c6f4d1f7f8abc",
        "share": "https://moltly.xyz/?view=specimens&specimen=Nyx&specimenId=67dff0db3e1c6f4d1f7f8abc&owner=67c111223344556677889900&species=Grammostola+pulchra"
      }
    }
  ],
  "meta": {
    "count": 1,
    "total": 3,
    "limit": 10,
    "offset": 0,
    "page": 1,
    "hasMore": false,
    "generatedAt": "2026-03-23T23:10:00.000Z",
    "readOnly": true,
    "includesImages": true,
    "filters": {
      "species": "Grammostola pulchra",
      "status": "seeking_female",
      "sex": null,
      "ownerId": null,
      "search": null
    }
  }
}
```

## Detail Response

### Example Request

```bash
curl "https://moltly.xyz/api/public/pairings/67dff0db3e1c6f4d1f7f8abc"
```

### Example Response

```json
{
  "listingId": "67dff0db3e1c6f4d1f7f8abc",
  "specimenId": "67dff0db3e1c6f4d1f7f8abc",
  "specimenName": "Nyx",
  "species": "Grammostola pulchra",
  "sex": "Male",
  "imageUrl": "https://moltly.xyz/api/image?url=https%3A%2F%2Fmoltly-uploads.example%2Fmolt-uploads%2Fabc%2Fcover.jpg",
  "notes": "Calm temperament, proven feeder.",
  "pairingStatus": "seeking_female",
  "pairingNotes": "Fresh mature male, last molt 2026-02-03.",
  "createdAt": "2026-02-10T18:32:11.000Z",
  "updatedAt": "2026-03-21T08:15:44.000Z",
  "owner": {
    "id": "67c111223344556677889900",
    "name": "arachnokeeper",
    "username": "arachnokeeper",
    "imageUrl": "https://moltly.xyz/avatar.png"
  },
  "contact": {
    "method": "discord",
    "value": "arachnokeeper#1234",
    "notes": "Messages preferred in the evening."
  },
  "attachments": [],
  "images": [],
  "urls": {
    "api": "https://moltly.xyz/api/public/pairings/67dff0db3e1c6f4d1f7f8abc",
    "share": "https://moltly.xyz/?view=specimens&specimen=Nyx&specimenId=67dff0db3e1c6f4d1f7f8abc&owner=67c111223344556677889900&species=Grammostola+pulchra"
  }
}
```

## Response Fields

### Listing Object

| Field | Type | Description |
| --- | --- | --- |
| `listingId` | string | Listing identifier. Currently matches `specimenId` |
| `specimenId` | string | Specimen record ID |
| `specimenName` | string | Public specimen name |
| `species` | string nullable | Species name |
| `sex` | string nullable | `Male`, `Female`, `Unknown`, or `Unsexed` |
| `imageUrl` | string nullable | Primary public image URL, usually the cover image |
| `notes` | string nullable | Public specimen notes |
| `pairingStatus` | string | `seeking_male`, `seeking_female`, or `open_to_offers` |
| `pairingNotes` | string nullable | Pairing-specific notes |
| `createdAt` | string nullable | ISO 8601 creation timestamp |
| `updatedAt` | string | ISO 8601 last update timestamp |
| `owner` | object | Public owner metadata |
| `contact` | object | Public contact details supplied by the listing owner |
| `attachments` | array | Attachment images only |
| `images` | array | Combined list of cover image plus attachment images |
| `urls.api` | string | Canonical API URL for this listing |
| `urls.share` | string | Moltly share URL back to the specimen view |

### Owner Object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Moltly user ID |
| `name` | string | Public owner display name |
| `username` | string nullable | Public username if available |
| `imageUrl` | string nullable | Public owner profile image URL if available |

### Contact Object

| Field | Type | Description |
| --- | --- | --- |
| `method` | string | `email`, `discord`, `instagram`, `facebook`, `telegram`, or `other` |
| `value` | string | Public contact handle, address, or identifier |
| `notes` | string nullable | Additional contact instructions |

### Image Object

| Field | Type | Description |
| --- | --- | --- |
| `kind` | string | `cover` or `attachment` |
| `name` | string nullable | Image label or attachment filename |
| `type` | string nullable | MIME type or generic type |
| `url` | string | Public image URL to use |
| `originalUrl` | string nullable | Original uploaded asset URL when Moltly returns a proxied image URL |
| `addedAt` | string nullable | ISO 8601 timestamp for attachments |

### Meta Object

| Field | Type | Description |
| --- | --- | --- |
| `count` | integer | Number of items returned in the current page |
| `total` | integer | Total number of matching listings before pagination |
| `limit` | integer | Effective page size |
| `offset` | integer | Effective zero-based offset |
| `page` | integer nullable | Effective one-based page number when `offset` is not used |
| `hasMore` | boolean | Whether more rows exist after this page |
| `generatedAt` | string | ISO 8601 feed generation timestamp |
| `readOnly` | boolean | Always `true` |
| `includesImages` | boolean | Always `true` |
| `filters` | object | Echo of the normalized query filters |

## Pairing Status Values

Public listings expose these statuses:

- `seeking_male`
- `seeking_female`
- `open_to_offers`

`none` is not returned in public results.

## Image URL Behavior

`imageUrl` and entries inside `images` are safe public URLs intended for direct use by consumers.

When a listing image originates from Moltly-managed object storage, the API may return:

- `url`: a stable Moltly image proxy URL such as `https://moltly.xyz/api/image?...`
- `originalUrl`: the underlying storage URL

For external image URLs, `url` may point directly to the original asset and `originalUrl` may be omitted.

## Error Responses

### 404 Not Found

Returned by `GET /api/public/pairings/{id}` when the listing does not exist or is not public.

```json
{
  "error": "Pairing listing not found"
}
```

### 500 Internal Server Error

Returned when the server cannot build the feed.

Collection endpoint:

```json
{
  "error": "Failed to load public pairing listings"
}
```

Detail endpoint:

```json
{
  "error": "Failed to load public pairing listing"
}
```

## CORS and Browser Use

The public endpoints return permissive CORS headers:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

This allows browser-based third-party applications to fetch the API directly.

## Example Integrations

### Fetch All Current Ads

```bash
curl "https://moltly.xyz/api/public/pairings"
```

### Find Female Specimens Open to Offers

```bash
curl "https://moltly.xyz/api/public/pairings?sex=Female&status=open_to_offers"
```

### Search Across the Feed

```bash
curl "https://moltly.xyz/api/public/pairings?search=grammostola"
```

### Paginate Through the Feed

```bash
curl "https://moltly.xyz/api/public/pairings?limit=20&page=3"
```

## Notes

- This API is read-only.
- Data visibility depends on user-configured public pairing contact details.
- Archived specimens are not included.
- The detail endpoint returns the same listing shape as the collection items.
