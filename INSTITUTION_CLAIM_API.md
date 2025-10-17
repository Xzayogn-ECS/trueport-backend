# Institution Claim API Documentation

## Overview
This system allows regular users to create institution pages that require KYC verification and admin approval. Once approved, an institution page and admin account are automatically created.

---

## User Flow

### 1. User Creates Institution Claim
**Endpoint:** `POST /api/institution-claims`  
**Auth:** Required (Bearer token)

**Request Body:**
```json
{
  "institutionName": "Example University",
  "institutionType": "UNIVERSITY",
  "email": "contact@example.edu",
  "phone": "+1234567890",
  "website": "https://example.edu",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "country": "USA",
    "postalCode": "10001"
  },
  "adminDetails": {
    "name": "John Doe",
    "email": "john.doe@example.edu",
    "phone": "+1234567890",
    "designation": "Dean"
  },
  "description": "A leading university...",
  "establishedYear": 1990
}
```

**Response:**
```json
{
  "message": "Institution claim created successfully. Please complete KYC verification.",
  "claim": {
    "id": "claim_id",
    "institutionName": "Example University",
    "status": "PENDING",
    "kycVerified": false
  }
}
```

---

### 2. View Unverified Claims (Public)
**Endpoint:** `GET /api/institution-claims/unverified`  
**Auth:** Not required

**Query Params:**
- `page` (default: 1)
- `limit` (default: 20)

**Response:**
```json
{
  "claims": [
    {
      "id": "claim_id",
      "institutionName": "Example University",
      "institutionType": "UNIVERSITY",
      "email": "contact@example.edu",
      "website": "https://example.edu",
      "status": "PENDING",
      "createdAt": "2025-10-11T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

**Frontend Usage:**
- Display this list on user dashboard
- Show "KYC Unverified" badge
- Embed Google Form/Tally form for KYC submission

---

### 3. Get My Claims
**Endpoint:** `GET /api/institution-claims/my-claims`  
**Auth:** Required

**Response:**
```json
{
  "claims": [
    {
      "id": "claim_id",
      "institutionName": "Example University",
      "status": "PENDING",
      "kycVerified": false,
      "createdAt": "2025-10-11T10:00:00Z"
    }
  ]
}
```

---

### 4. Get Specific Claim
**Endpoint:** `GET /api/institution-claims/:claimId`  
**Auth:** Required (only creator or super admin can view)

**Response:**
```json
{
  "claim": {
    "id": "claim_id",
    "institutionName": "Example University",
    "institutionType": "UNIVERSITY",
    "email": "contact@example.edu",
    "adminDetails": {
      "name": "John Doe",
      "email": "john.doe@example.edu"
    },
    "status": "PENDING",
    "kycVerified": false,
    "createdBy": {
      "id": "user_id",
      "name": "User Name",
      "email": "user@example.com"
    },
    "createdAt": "2025-10-11T10:00:00Z"
  }
}
```

---

### 5. Update KYC Form URL (Optional)
**Endpoint:** `PATCH /api/institution-claims/:claimId/kyc-form`  
**Auth:** Required (only creator)

**Request Body:**
```json
{
  "kycFormUrl": "https://forms.google.com/..."
}
```

**Response:**
```json
{
  "message": "KYC form URL updated successfully",
  "claim": { ... }
}
```

---

### 6. Submit KYC
**Endpoint:** `POST /api/institution-claims/:claimId/submit-kyc`  
**Auth:** Required (only creator)

**Response:**
```json
{
  "message": "KYC submitted successfully. Awaiting admin approval.",
  "claim": {
    "id": "claim_id",
    "status": "KYC_SUBMITTED",
    "kycSubmittedAt": "2025-10-11T11:00:00Z"
  }
}
```

---

## Super Admin Flow

### 1. Get All Claims
**Endpoint:** `GET /api/institution-claims/admin/all`  
**Auth:** Required (Super Admin only)

**Query Params:**
- `status` (optional: PENDING, KYC_SUBMITTED, APPROVED, REJECTED)
- `page` (default: 1)
- `limit` (default: 20)

**Response:**
```json
{
  "claims": [ ... ],
  "statusCounts": {
    "PENDING": 5,
    "KYC_SUBMITTED": 3,
    "APPROVED": 10,
    "REJECTED": 2
  },
  "pagination": { ... }
}
```

---

### 2. Approve Claim (Creates Institution + Admin Account)
**Endpoint:** `POST /api/institution-claims/admin/:claimId/approve`  
**Auth:** Required (Super Admin only)

**Request Body:**
```json
{
  "adminPassword": "SecurePassword123",
  "adminNotes": "Approved after verifying documents"
}
```

**Response:**
```json
{
  "message": "Claim approved successfully. Institution and admin account created.",
  "claim": { ... },
  "institution": {
    "id": "institution_id",
    "name": "Example University"
  },
  "admin": {
    "id": "admin_id",
    "email": "john.doe@example.edu",
    "temporaryPassword": "SecurePassword123"
  }
}
```

**What happens:**
1. Creates Institution with `kycVerified: true` and `createdByUser: true`
2. Creates InstituteAdmin account with provided credentials
3. Updates claim status to `APPROVED`
4. Links institution and admin to the claim

---

### 3. Reject Claim
**Endpoint:** `POST /api/institution-claims/admin/:claimId/reject`  
**Auth:** Required (Super Admin only)

**Request Body:**
```json
{
  "rejectionReason": "Insufficient documentation",
  "adminNotes": "Need proper accreditation proof"
}
```

**Response:**
```json
{
  "message": "Claim rejected successfully",
  "claim": {
    "id": "claim_id",
    "status": "REJECTED",
    "rejectionReason": "Insufficient documentation",
    "reviewedAt": "2025-10-11T12:00:00Z"
  }
}
```

---

## Status Flow

```
PENDING → KYC_SUBMITTED → APPROVED/REJECTED
```

### Status Descriptions:
- **PENDING**: Initial state, user can still edit
- **KYC_SUBMITTED**: User submitted KYC, awaiting admin review
- **APPROVED**: Admin approved, institution and admin account created
- **REJECTED**: Admin rejected with reason

---

## Institution Types

- `UNIVERSITY`
- `COLLEGE`
- `SCHOOL`
- `TRAINING_CENTER`
- `INSTITUTE`
- `OTHER`

---

## Frontend Implementation Guide

### User Dashboard
```javascript
// 1. Fetch unverified claims
const response = await fetch('/api/institution-claims/unverified');
const { claims } = await response.json();

// Display each claim with:
// - Institution name
// - "KYC Unverified" badge
// - Button to view details
// - Embed Google Form for KYC
```

### Create Claim Form
```javascript
// Submit claim
const response = await fetch('/api/institution-claims', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    institutionName: "...",
    institutionType: "UNIVERSITY",
    email: "...",
    adminDetails: { ... }
  })
});
```

### KYC Submission
```javascript
// After user fills Google Form, mark as submitted
const response = await fetch(`/api/institution-claims/${claimId}/submit-kyc`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Super Admin Dashboard
```javascript
// Get all claims with filters
const response = await fetch('/api/institution-claims/admin/all?status=KYC_SUBMITTED');
const { claims, statusCounts } = await response.json();

// Approve claim
const approveResponse = await fetch(`/api/institution-claims/admin/${claimId}/approve`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${superAdminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    adminPassword: "GeneratedPassword123",
    adminNotes: "Approved"
  })
});
```

---

## Key Features

✅ User-initiated institution creation  
✅ KYC verification workflow  
✅ Public endpoint for unverified claims  
✅ Super admin approval system  
✅ Automatic institution + admin account creation  
✅ Status tracking and filtering  
✅ Rejection with reasons  
✅ Admin notes and audit trail  

---

## Security Notes

- Only claim creator can update/submit KYC
- Only super admin can approve/reject
- Unverified claims visible to all users (for transparency)
- Full claim details only visible to creator and super admin
- Passwords are hashed with bcrypt
- Email notifications should be implemented for status changes
