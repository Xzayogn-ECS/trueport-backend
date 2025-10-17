# Institution Claim System Documentation

## Overview

The system now supports **claiming** institutions that are imported via CSV. This allows you to import all Indian colleges/universities as ACTIVE but **unclaimed**, and let authorized users claim and verify their institutions.

---

## Institution States

### 1. **CSV Imported - Unclaimed**
- `status`: `ACTIVE` (visible to all users)
- `claimed`: `false`
- `claimStatus`: `UNCLAIMED`
- `kycVerified`: `false`
- `importedFromCSV`: `true`

### 2. **Claim Pending**
- User has initiated claim
- `claimStatus`: `CLAIM_PENDING`
- `claimedBy`: User ID
- `claimedAt`: Timestamp
- Waiting for KYC form submission

### 3. **Claimed & Verified**
- Admin has approved after KYC verification
- `claimed`: `true`
- `claimStatus`: `CLAIMED`
- `kycVerified`: `true`
- Institute admin account created

---

## CSV Import Template

### CSV Columns:
```csv
name,displayName,description,website,logo,district,state,email,phone
```

### Example:
```csv
name,displayName,description,website,logo,district,state,email,phone
"IIT Bombay","Indian Institute of Technology Bombay","Premier engineering institution","https://www.iitb.ac.in","","Mumbai","Maharashtra","info@iitb.ac.in","+91-22-2572-2545"
```

### Auto-Set Fields:
- `status`: `ACTIVE` (always)
- `claimed`: `false`
- `claimStatus`: `UNCLAIMED`
- `kycVerified`: `false`
- `importedFromCSV`: `true`

---

## Import Process

### 1. **Prepare CSV File**
Use the template: `institution_import_template.csv`

### 2. **Run Import Script**
```bash
node importInstitutions.js <path-to-csv>
```

Example:
```bash
node importInstitutions.js ./indian_universities.csv
```

### 3. **Script Output**
```
🏛️  INSTITUTION BULK IMPORT
📁 CSV File: ./indian_universities.csv
📊 Parsed 500 institutions from CSV

✅ Imported: IIT Bombay
✅ Imported: Mumbai University
⚠️  Skipped (duplicate): Delhi University
...

📋 IMPORT SUMMARY
✅ Successfully imported: 485
⚠️  Duplicates skipped: 15
❌ Errors: 0
📊 Total processed: 500
```

---

## User Flow: Claiming an Institution

### Step 1: Browse Unclaimed Institutions
**Endpoint:** `GET /api/institution-create/unclaimed`

**Query Parameters:**
- `search` - Search by name
- `district` - Filter by district
- `state` - Filter by state
- `page`, `limit` - Pagination

**Response:**
```json
{
  "institutions": [
    {
      "_id": "inst123",
      "name": "IIT Bombay",
      "displayName": "Indian Institute of Technology Bombay",
      "description": "Premier engineering institution",
      "website": "https://www.iitb.ac.in",
      "address": {
        "district": "Mumbai",
        "state": "Maharashtra"
      },
      "contactInfo": {
        "email": "info@iitb.ac.in",
        "phone": "+91-22-2572-2545"
      },
      "importedFromCSV": true
    }
  ]
}
```

### Step 2: Initiate Claim
**Endpoint:** `POST /api/institution-create/:institutionId/claim`

**Headers:**
```
Authorization: Bearer <user-token>
```

**Response:**
```json
{
  "message": "Claim initiated successfully. Please complete the KYC form to verify your claim.",
  "institution": {
    "id": "inst123",
    "name": "IIT Bombay",
    "claimStatus": "CLAIM_PENDING",
    "claimedAt": "2025-10-11T10:30:00.000Z"
  },
  "nextStep": "SUBMIT_KYC_FORM"
}
```

### Step 3: Fill KYC Form (Frontend)
- Frontend shows Google Form embedded or redirects
- Form should collect:
  - User's official designation
  - Proof of association (ID card, appointment letter)
  - Contact details
  - Any additional verification documents

### Step 4: Mark KYC as Submitted
**Endpoint:** `POST /api/institution-create/:institutionId/kyc-submitted`

**Headers:**
```
Authorization: Bearer <user-token>
```

**Response:**
```json
{
  "message": "KYC form submission recorded. Awaiting admin approval.",
  "institution": {
    "id": "inst123",
    "name": "IIT Bombay",
    "claimStatus": "CLAIM_PENDING",
    "kycFormSubmittedAt": "2025-10-11T10:35:00.000Z"
  }
}
```

---

## Admin Flow: Approving Claims

### Step 1: View Pending Claims
**Endpoint:** `GET /api/institution-create/admin/all?kycVerified=false`

**Headers:**
```
Authorization: Bearer <super-admin-token>
```

**Response:**
```json
{
  "institutions": [
    {
      "_id": "inst123",
      "name": "IIT Bombay",
      "displayName": "Indian Institute of Technology Bombay",
      "claimStatus": "CLAIM_PENDING",
      "kycFormSubmittedAt": "2025-10-11T10:35:00.000Z",
      "claimed": false,
      "kycVerified": false,
      "claimedBy": {
        "_id": "user123",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "counts": {
    "verified": 100,
    "unverified": 25,
    "total": 125
  }
}
```

### Step 2: Review KYC Form
- Admin reviews Google Form responses
- Verifies documents
- Decides to approve or reject

### Step 3: Approve & Create Admin Account
**Endpoint:** `POST /api/institution-create/admin/:institutionId/approve`

**Headers:**
```
Authorization: Bearer <super-admin-token>
```

**Body:**
```json
{
  "adminEmail": "admin@iitb.ac.in",
  "adminName": "Prof. Ramesh Kumar",
  "adminPassword": "SecurePassword123!"
}
```

**Response:**
```json
{
  "message": "Institution approved and admin account created successfully",
  "institution": {
    "id": "inst123",
    "name": "IIT Bombay",
    "displayName": "Indian Institute of Technology Bombay",
    "kycVerified": true,
    "claimed": true,
    "claimStatus": "CLAIMED",
    "status": "ACTIVE"
  },
  "admin": {
    "id": "admin123",
    "name": "Prof. Ramesh Kumar",
    "email": "admin@iitb.ac.in",
    "message": "Credentials should be sent via email"
  }
}
```

---

## API Endpoints Summary

### Public/User Endpoints:
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/institution-create/unclaimed` | List unclaimed institutions | No |
| GET | `/api/institution-create/unverified` | List unverified institutions | No |
| GET | `/api/institution-create/:id` | Get institution details | No |
| GET | `/api/institution-create/my-institutions` | Get user's created/claimed institutions | Yes |
| POST | `/api/institution-create/:id/claim` | Initiate claim on institution | Yes |
| POST | `/api/institution-create/:id/kyc-submitted` | Mark KYC form as submitted | Yes |

### Admin Endpoints:
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/institution-create/admin/all` | Get all institutions (with filters) | Super Admin |
| POST | `/api/institution-create/admin/:id/approve` | Approve claim & create admin | Super Admin |
| DELETE | `/api/institution-create/admin/:id` | Delete institution | Super Admin |

---

## Frontend Implementation Guide

### 1. **Unclaimed Institutions Page**
```javascript
// Fetch unclaimed institutions
const response = await fetch('/api/institution-create/unclaimed?search=IIT&state=Maharashtra');
const { institutions } = await response.json();

// Display list with "Claim" button for each
institutions.map(inst => (
  <InstitutionCard 
    institution={inst}
    onClaim={() => claimInstitution(inst._id)}
  />
));
```

### 2. **Claim Initiation**
```javascript
const claimInstitution = async (institutionId) => {
  const response = await fetch(`/api/institution-create/${institutionId}/claim`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  const data = await response.json();
  
  if (data.nextStep === 'SUBMIT_KYC_FORM') {
    // Show Google Form
    showKYCForm(institutionId);
  }
};
```

### 3. **KYC Form Submission**
```javascript
const markKYCSubmitted = async (institutionId) => {
  await fetch(`/api/institution-create/${institutionId}/kyc-submitted`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  alert('KYC submitted! Please wait for admin approval.');
};
```

### 4. **Admin Approval Interface**
```javascript
const approveInstitution = async (institutionId, adminDetails) => {
  await fetch(`/api/institution-create/admin/${institutionId}/approve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      adminEmail: adminDetails.email,
      adminName: adminDetails.name,
      adminPassword: adminDetails.password
    })
  });
  
  alert('Institution approved and admin account created!');
};
```

---

## Database Schema

### Institution Model Fields:
```javascript
{
  name: String,
  displayName: String,
  description: String,
  website: String,
  logo: String,
  address: {
    district: String,
    state: String
  },
  contactInfo: {
    email: String,
    phone: String
  },
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
  kycVerified: Boolean,
  claimed: Boolean,
  claimedBy: ObjectId (ref: User),
  claimedAt: Date,
  claimStatus: 'UNCLAIMED' | 'CLAIM_PENDING' | 'CLAIMED',
  kycFormSubmittedAt: Date,
  importedFromCSV: Boolean,
  createdByUser: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Benefits of This Approach

1. **Scalability**: Import thousands of institutions at once via CSV
2. **Verification**: Only verified institutions get admin access
3. **User-Driven**: Institutions can claim themselves
4. **Control**: Admins verify each claim before granting access
5. **Visibility**: All institutions visible to users immediately
6. **Flexibility**: Supports both CSV import and manual creation

---

## Next Steps

1. ✅ Import Indian institutions via CSV
2. ✅ Users browse and claim their institutions
3. ✅ Users fill KYC form (Google Form)
4. ✅ Admins review and approve
5. ✅ Admin accounts created automatically
6. 📧 TODO: Email notifications (claim confirmation, approval, credentials)
7. 📱 TODO: SMS notifications for admin credentials

---

## Example: Complete Flow

```
1. Admin imports 500 institutions via CSV
   → All set to ACTIVE, UNCLAIMED, kycVerified=false

2. Dr. Sharma (from IIT Bombay) logs in
   → Searches for "IIT Bombay"
   → Clicks "Claim This Institution"
   → Status changes to CLAIM_PENDING

3. Dr. Sharma fills Google Form
   → Uploads ID card, appointment letter
   → Clicks "Submit"
   → Frontend calls /kyc-submitted endpoint

4. Super Admin reviews Google Form responses
   → Verifies Dr. Sharma's credentials
   → Enters admin email: admin@iitb.ac.in
   → Enters admin name: Prof. Sharma
   → Generates password
   → Clicks "Approve & Create Admin"

5. System creates InstituteAdmin account
   → Institution marked as CLAIMED, kycVerified=true
   → Email sent to Dr. Sharma with admin credentials
   → IIT Bombay now has its own admin portal access
```

---

## Security Considerations

1. **KYC Verification**: Manual admin review prevents fraudulent claims
2. **Email Verification**: Only verified emails can claim
3. **Document Verification**: Google Form collects proof documents
4. **Admin Oversight**: Super admin approves every claim
5. **Password Security**: Passwords are hashed with bcrypt
6. **Audit Trail**: claimedBy, claimedAt tracked for every claim
