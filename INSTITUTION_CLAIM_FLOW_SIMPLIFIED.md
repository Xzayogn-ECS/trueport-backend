# Institution Claim Flow - Simplified Version

## Overview
This document describes the simplified institution claiming system where users can claim institutions that were bulk-imported via CSV. The flow is intentionally minimal - no automatic admin account creation, no complex KYC forms.

## Key Concepts

### Institution Status Flags
- **claimed** (Boolean): Whether the institution has been claimed by a user
- **claimedBy** (User ref): Reference to the user who claimed it
- **claimedAt** (Date): When the claim was approved
- **importedFromCSV** (Boolean): Whether this institution was bulk-imported

### Claim Request Model
Separate model `InstitutionClaimRequest` tracks claim requests:
- **institutionId**: Which institution is being claimed
- **userId**: Who is requesting to claim it
- **name, email, phone, designation**: Requester's details
- **status**: PENDING, APPROVED, or REJECTED
- **reviewedBy, reviewedAt**: Admin who processed the request
- **rejectionReason**: Why it was rejected (if applicable)

## Complete Flow

### 1. CSV Import (Admin)
```bash
node scripts/importInstitutions.js path/to/institutions.csv
```
- All institutions imported with:
  - `status: 'ACTIVE'`
  - `claimed: false`
  - `kycVerified: false`
  - `importedFromCSV: true`

### 2. User Browses Institutions
**Endpoint**: `GET /api/institutions`

Query parameters:
- `search`: Search by name or displayName
- `district`: Filter by district
- `state`: Filter by state
- `claimed`: Filter by claimed status (true/false)

Response includes claimed/unclaimed flags for each institution.

### 3. User Submits Claim Request
**Endpoint**: `POST /api/institutions/:institutionId/claim`

Request body:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "designation": "Dean"
}
```

Validations:
- Institution must exist
- Institution must not already be claimed
- User must be authenticated
- User can only have one pending request per institution

### 4. User Views Their Requests
**Endpoint**: `GET /api/institutions/my-requests`

Query parameters:
- `status`: Filter by PENDING, APPROVED, or REJECTED

Returns all claim requests submitted by the authenticated user.

### 5. Admin Views All Claim Requests
**Endpoint**: `GET /api/institutions/admin/requests`

Query parameters:
- `status`: Filter by PENDING, APPROVED, or REJECTED
- `page`, `limit`: Pagination

Response includes:
- List of requests with institution and user details
- Status counts (how many pending, approved, rejected)
- Pagination metadata

### 6a. Admin Approves Claim
**Endpoint**: `POST /api/institutions/admin/requests/:requestId/approve`

What happens:
1. Validates request is PENDING
2. Validates institution is not already claimed
3. Updates institution:
   - `claimed: true`
   - `claimedBy: userId`
   - `claimedAt: new Date()`
4. Updates claim request:
   - `status: 'APPROVED'`
   - `reviewedBy: adminId`
   - `reviewedAt: new Date()`
5. TODO: Send email to user notifying approval

**Note**: NO automatic admin account creation. Admin accounts should be created manually through the institute admin management interface.

### 6b. Admin Rejects Claim
**Endpoint**: `POST /api/institutions/admin/requests/:requestId/reject`

Request body:
```json
{
  "rejectionReason": "Insufficient documentation provided"
}
```

What happens:
1. Validates request is PENDING
2. Updates claim request:
   - `status: 'REJECTED'`
   - `reviewedBy: adminId`
   - `reviewedAt: new Date()`
   - `rejectionReason: reason`
3. TODO: Send email to user notifying rejection

Institution remains unclaimed and can be claimed by someone else.

## API Endpoints Summary

### Public/User Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/institutions` | None | List all institutions with filters |
| POST | `/api/institutions/:id/claim` | User | Submit claim request |
| GET | `/api/institutions/my-requests` | User | View own claim requests |

### Admin Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/institutions/admin/requests` | SuperAdmin | List all claim requests |
| POST | `/api/institutions/admin/requests/:id/approve` | SuperAdmin | Approve claim request |
| POST | `/api/institutions/admin/requests/:id/reject` | SuperAdmin | Reject claim request |

## Database Models

### Institution (relevant fields)
```javascript
{
  name: String,
  displayName: String,
  address: {
    district: String,
    state: String
  },
  contactInfo: {
    email: String,
    phone: String
  },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'] },
  claimed: { type: Boolean, default: false },
  claimedBy: { type: ObjectId, ref: 'User' },
  claimedAt: Date,
  importedFromCSV: { type: Boolean, default: false },
  kycVerified: { type: Boolean, default: false },
  createdByUser: { type: Boolean, default: false }
}
```

### InstitutionClaimRequest
```javascript
{
  institutionId: { type: ObjectId, ref: 'Institution', required: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  designation: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  reviewedBy: { type: ObjectId, ref: 'SuperAdmin' },
  reviewedAt: Date,
  rejectionReason: String
}
```

## CSV Template
File: `institution_import_template.csv`

```csv
name,displayName,description,website,logo,district,state,email,phone
"Indian Institute of Technology Delhi","IIT Delhi","Premier engineering institute","https://iitd.ac.in","https://logo.url","South Delhi","Delhi","admin@iitd.ac.in","+911126591999"
```

Fields:
- **name**: Official institution name (required)
- **displayName**: Display name for UI (required)
- **description**: Brief description (optional)
- **website**: Institution website URL (optional)
- **logo**: Logo image URL (optional)
- **district**: District name (required)
- **state**: State name (required)
- **email**: Contact email (optional)
- **phone**: Contact phone (optional)

## Key Design Decisions

1. **Separate Claim Request Model**: Keeps Institution model clean and allows tracking of all claim attempts
2. **No Automatic Admin Creation**: Admin accounts are created manually through institute admin interface
3. **Simple Approval**: Just toggles claimed flag - no complex workflows
4. **District/State Only**: Simplified address to just district and state (no street, city, zipCode)
5. **One Request Per User Per Institution**: Users can only have one pending request for each institution

## Future Enhancements (TODO)
- [ ] Email notifications on claim approval/rejection
- [ ] Support for uploading proof documents with claim request
- [ ] Auto-populate email/phone from institution data in claim form
- [ ] Dashboard for users to track all their claimed institutions
- [ ] Bulk approval/rejection for admins
