# Address Structure Update

## Updated Institution Address Format

The Institution model's address field has been updated to a simplified structure with only **District** and **State** fields.

### New Address Structure

```javascript
address: {
  district: {
    type: String,
    trim: true,
    maxLength: 100
  },
  state: {
    type: String,
    trim: true,
    maxLength: 100
  }
}
```

### Old Structure (Removed)
```javascript
address: {
  street: String,
  city: String,
  state: String,
  zipCode: String,
  country: String
}
```

---

## Updated Endpoints

### 1. **POST /api/institution-create** (User creates institution)
**Request Body:**
```json
{
  "name": "Example University",
  "displayName": "Example University",
  "description": "A leading educational institution",
  "website": "https://example.edu",
  "logo": "https://example.com/logo.png",
  "address": {
    "district": "Mumbai",
    "state": "Maharashtra"
  },
  "contactInfo": {
    "email": "admin@example.edu",
    "phone": "+91-1234567890"
  }
}
```

**Response:**
```json
{
  "message": "Institution created successfully. It will show as unverified until admin approval.",
  "institution": {
    "id": "670f1a2b3c4d5e6f7g8h9i0j",
    "name": "Example University",
    "displayName": "Example University",
    "status": "INACTIVE",
    "kycVerified": false,
    "createdByUser": true
  }
}
```

---

### 2. **GET /api/institution-create/unverified** (Public - shows unverified institutions)
**Response:**
```json
{
  "institutions": [
    {
      "_id": "670f1a2b3c4d5e6f7g8h9i0j",
      "name": "Example University",
      "displayName": "Example University",
      "description": "A leading educational institution",
      "website": "https://example.edu",
      "logo": "https://example.com/logo.png",
      "address": {
        "district": "Mumbai",
        "state": "Maharashtra"
      },
      "contactInfo": {
        "email": "admin@example.edu",
        "phone": "+91-1234567890"
      },
      "status": "INACTIVE",
      "createdAt": "2025-10-11T10:30:00.000Z",
      "createdBy": {
        "_id": "user123",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

---

### 3. **GET /api/institution-create/my-institutions** (User's created institutions)
**Response:**
```json
{
  "institutions": [
    {
      "_id": "670f1a2b3c4d5e6f7g8h9i0j",
      "name": "Example University",
      "displayName": "Example University",
      "description": "A leading educational institution",
      "website": "https://example.edu",
      "address": {
        "district": "Mumbai",
        "state": "Maharashtra"
      },
      "contactInfo": {
        "email": "admin@example.edu",
        "phone": "+91-1234567890"
      },
      "status": "INACTIVE",
      "kycVerified": false,
      "createdByUser": true,
      "createdAt": "2025-10-11T10:30:00.000Z"
    }
  ]
}
```

---

### 4. **GET /api/institution-create/:institutionId** (Get specific institution)
**Response:**
```json
{
  "institution": {
    "_id": "670f1a2b3c4d5e6f7g8h9i0j",
    "name": "Example University",
    "displayName": "Example University",
    "description": "A leading educational institution",
    "website": "https://example.edu",
    "logo": "https://example.com/logo.png",
    "address": {
      "district": "Mumbai",
      "state": "Maharashtra"
    },
    "contactInfo": {
      "email": "admin@example.edu",
      "phone": "+91-1234567890"
    },
    "status": "INACTIVE",
    "kycVerified": false,
    "createdByUser": true,
    "createdAt": "2025-10-11T10:30:00.000Z",
    "createdBy": {
      "_id": "user123",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

---

### 5. **GET /api/users/institutions** (Get all ACTIVE institutions)
**Query Parameters:**
- `search` - Search by name or displayName
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 100)

**Response:**
```json
{
  "institutions": [
    {
      "id": "670f1a2b3c4d5e6f7g8h9i0j",
      "name": "Example University",
      "displayName": "Example University",
      "logo": "https://example.com/logo.png",
      "description": "A leading educational institution",
      "website": "https://example.edu",
      "address": {
        "district": "Mumbai",
        "state": "Maharashtra"
      },
      "kycVerified": true,
      "createdByUser": true,
      "createdAt": "2025-10-11T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "pages": 1
  },
  "total": 1
}
```

---

### 6. **POST /api/super-admin/institutions** (Super admin creates institution)
**Request Body:**
```json
{
  "name": "Example University",
  "displayName": "Example University",
  "description": "A leading educational institution",
  "website": "https://example.edu",
  "logo": "https://example.com/logo.png",
  "address": {
    "district": "Mumbai",
    "state": "Maharashtra"
  },
  "contactInfo": {
    "email": "admin@example.edu",
    "phone": "+91-1234567890"
  },
  "settings": {
    "allowSelfRegistration": true,
    "requireVerifierApproval": true,
    "maxUsersLimit": 1000
  }
}
```

**Response:**
```json
{
  "message": "Institution created successfully",
  "institution": {
    "_id": "670f1a2b3c4d5e6f7g8h9i0j",
    "name": "Example University",
    "displayName": "Example University",
    "description": "A leading educational institution",
    "website": "https://example.edu",
    "logo": "https://example.com/logo.png",
    "address": {
      "district": "Mumbai",
      "state": "Maharashtra"
    },
    "contactInfo": {
      "email": "admin@example.edu",
      "phone": "+91-1234567890"
    },
    "settings": {
      "allowSelfRegistration": true,
      "requireVerifierApproval": true,
      "maxUsersLimit": 1000
    },
    "status": "ACTIVE",
    "kycVerified": true,
    "createdByUser": false,
    "createdAt": "2025-10-11T10:30:00.000Z"
  }
}
```

---

### 7. **GET /api/institution-create/admin/all** (Super admin - get all user-created institutions)
**Query Parameters:**
- `kycVerified` - Filter by verification status (true/false)
- `page` - Page number
- `limit` - Items per page

**Response:**
```json
{
  "institutions": [
    {
      "_id": "670f1a2b3c4d5e6f7g8h9i0j",
      "name": "Example University",
      "displayName": "Example University",
      "address": {
        "district": "Mumbai",
        "state": "Maharashtra"
      },
      "contactInfo": {
        "email": "admin@example.edu",
        "phone": "+91-1234567890"
      },
      "status": "INACTIVE",
      "kycVerified": false,
      "createdByUser": true,
      "createdBy": {
        "_id": "user123",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "counts": {
    "verified": 5,
    "unverified": 3,
    "total": 8
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "pages": 1
  }
}
```

---

### 8. **POST /api/institution-create/admin/:institutionId/approve** (Super admin - approve institution)
**Response:**
```json
{
  "message": "Institution approved and verified successfully",
  "institution": {
    "id": "670f1a2b3c4d5e6f7g8h9i0j",
    "name": "Example University",
    "displayName": "Example University",
    "kycVerified": true,
    "status": "ACTIVE"
  }
}
```

---

### 9. **DELETE /api/institution-create/admin/:institutionId** (Super admin - delete institution)
**Response:**
```json
{
  "message": "Institution deleted successfully"
}
```

---

## Migration Notes

### For Existing Data:
If you have existing institutions with the old address structure, you may need to run a migration script to convert them:

```javascript
// Migration script (run once)
const Institution = require('./models/Institution');

async function migrateAddresses() {
  const institutions = await Institution.find({
    'address.city': { $exists: true }
  });

  for (const inst of institutions) {
    inst.address = {
      district: inst.address.city || '',
      state: inst.address.state || ''
    };
    await inst.save();
  }
  
  console.log(`Migrated ${institutions.length} institutions`);
}
```

### Frontend Updates Required:
1. Update all forms that create/edit institutions to use `district` and `state` fields
2. Update display components to show `district` and `state` instead of full address
3. Update any search/filter logic that references old address fields

---

## Summary

All endpoints that interact with the Institution model now use the simplified address structure:
- ✅ User creation endpoints (`/api/institution-create`)
- ✅ Public listing endpoints (`/api/users/institutions`)
- ✅ Super admin endpoints (`/api/super-admin/institutions`)
- ✅ Admin management endpoints (`/api/institution-create/admin/*`)

**No code changes needed** for most endpoints as they simply pass through the address object. The validation happens at the model level.
