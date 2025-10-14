# Collaboration System API Documentation

## Overview
The collaboration system allows project owners to invite other users to collaborate on their projects. Collaborators' profiles will show the projects they've collaborated on (up to 5 collaborators per project).

## Features
- Search for users to invite as collaborators
- Send collaboration requests with custom roles
- Accept/reject collaboration requests
- View incoming and outgoing requests
- Remove collaborators from projects
- Automatic portfolio visibility for accepted collaborators
- Maximum 5 collaborators per project

---

## API Endpoints

### 1. Search Users for Collaboration

**Endpoint:** `GET /api/collaborations/search-users`

**Auth Required:** Yes

**Query Parameters:**
- `query` (required): Search string (min 2 characters)
- `limit` (optional): Max results (default: 20)

**Request Example:**
```bash
GET /api/collaborations/search-users?query=john&limit=10
Authorization: Bearer {authToken}
```

**Response:**
```json
{
  "users": [
    {
      "_id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "profilePicture": "url",
      "role": "STUDENT"
    }
  ],
  "count": 1
}
```

---

### 2. Send Collaboration Request

**Endpoint:** `POST /api/collaborations/request`

**Auth Required:** Yes (must be project owner)

**Body:**
```json
{
  "projectId": "project123",
  "requestedUserId": "user456",
  "role": "Frontend Developer",
  "message": "Would love to have you collaborate on this project!"
}
```

**Response:**
```json
{
  "message": "Collaboration request sent successfully",
  "request": {
    "_id": "request123",
    "projectId": {
      "_id": "project123",
      "title": "My Awesome Project"
    },
    "projectOwnerId": "owner123",
    "requestedUserId": {
      "_id": "user456",
      "name": "Jane Smith"
    },
    "role": "Frontend Developer",
    "message": "Would love to have you collaborate on this project!",
    "status": "PENDING",
    "createdAt": "2025-10-10T12:00:00Z"
  }
}
```

**Validation:**
- Project must exist and user must be owner
- Requested user must exist
- Cannot invite yourself
- Max 5 collaborators per project
- User cannot already be a collaborator
- No duplicate pending requests

---

### 3. Get Incoming Collaboration Requests

**Endpoint:** `GET /api/collaborations/requests/incoming`

**Auth Required:** Yes

**Query Parameters:**
- `status` (optional): Filter by status (PENDING, ACCEPTED, REJECTED) - default: PENDING
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)

**Request Example:**
```bash
GET /api/collaborations/requests/incoming?status=PENDING&page=1&limit=10
Authorization: Bearer {authToken}
```

**Response:**
```json
{
  "requests": [
    {
      "_id": "request123",
      "projectId": {
        "_id": "project123",
        "title": "E-Commerce Platform",
        "description": "Full-stack e-commerce solution",
        "category": "WEB_APPLICATION",
        "projectType": "PROFESSIONAL"
      },
      "projectOwnerId": {
        "_id": "owner123",
        "name": "John Doe",
        "email": "john@example.com",
        "profilePicture": "url"
      },
      "role": "UI/UX Designer",
      "message": "Your design skills would be perfect for this project!",
      "status": "PENDING",
      "createdAt": "2025-10-10T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1
  }
}
```

---

### 4. Get Outgoing Collaboration Requests

**Endpoint:** `GET /api/collaborations/requests/outgoing`

**Auth Required:** Yes

**Query Parameters:**
- `status` (optional): Filter by status (PENDING, ACCEPTED, REJECTED, CANCELLED)
- `page` (optional): Page number
- `limit` (optional): Results per page

**Response:** Same structure as incoming requests, but shows requests you sent.

---

### 5. Accept Collaboration Request

**Endpoint:** `POST /api/collaborations/requests/:requestId/accept`

**Auth Required:** Yes (must be the requested user)

**Request Example:**
```bash
POST /api/collaborations/requests/request123/accept
Authorization: Bearer {authToken}
```

**Response:**
```json
{
  "message": "Collaboration request accepted",
  "request": {
    "_id": "request123",
    "status": "ACCEPTED",
    "respondedAt": "2025-10-10T13:00:00Z"
  },
  "project": {
    "id": "project123",
    "title": "E-Commerce Platform",
    "collaboratorsCount": 2
  }
}
```

**What Happens:**
1. User is added to `project.linkedCollaborators` array
2. Request status updated to ACCEPTED
3. Project now appears in user's portfolio under "Collaborated Projects"

---

### 6. Reject Collaboration Request

**Endpoint:** `POST /api/collaborations/requests/:requestId/reject`

**Auth Required:** Yes (must be the requested user)

**Body:**
```json
{
  "reason": "Not interested in this type of project at the moment"
}
```

**Response:**
```json
{
  "message": "Collaboration request rejected",
  "request": {
    "_id": "request123",
    "status": "REJECTED",
    "respondedAt": "2025-10-10T13:00:00Z",
    "rejectionReason": "Not interested in this type of project at the moment"
  }
}
```

---

### 7. Cancel Collaboration Request (By Owner)

**Endpoint:** `DELETE /api/collaborations/requests/:requestId`

**Auth Required:** Yes (must be project owner)

**Response:**
```json
{
  "message": "Collaboration request cancelled",
  "request": {
    "_id": "request123",
    "status": "CANCELLED"
  }
}
```

---

### 8. Remove Collaborator from Project

**Endpoint:** `DELETE /api/collaborations/projects/:projectId/collaborators/:userId`

**Auth Required:** Yes (must be project owner)

**Request Example:**
```bash
DELETE /api/collaborations/projects/project123/collaborators/user456
Authorization: Bearer {authToken}
```

**Response:**
```json
{
  "message": "Collaborator removed successfully",
  "project": {
    "id": "project123",
    "title": "E-Commerce Platform",
    "collaboratorsCount": 1
  }
}
```

**What Happens:**
- Collaborator is removed from project's linkedCollaborators array
- Project no longer appears in removed user's portfolio
- User can be re-invited in the future

---

### 9. Get My Collaborations

**Endpoint:** `GET /api/collaborations/my-collaborations`

**Auth Required:** Yes

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)

**Response:**
```json
{
  "projects": [
    {
      "_id": "project123",
      "title": "E-Commerce Platform",
      "description": "Full-stack e-commerce solution",
      "category": "WEB_APPLICATION",
      "userId": {
        "_id": "owner123",
        "name": "John Doe",
        "email": "john@example.com",
        "profilePicture": "url"
      },
      "linkedCollaborators": [
        {
          "userId": {
            "_id": "user456",
            "name": "Jane Smith"
          },
          "role": "Frontend Developer",
          "addedAt": "2025-10-10T13:00:00Z"
        }
      ],
      "createdAt": "2025-10-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "pages": 1
  }
}
```

---

## Portfolio Integration

### Portfolio Endpoint (Updated)

**Endpoint:** `GET /api/portfolio/:userId`

Projects in portfolio now include:
1. **Owned Projects**: Projects created by the user
2. **Collaborated Projects**: Projects where user is a linked collaborator

**Response Structure:**
```json
{
  "user": { /* user info */ },
  "projects": [
    {
      "_id": "project123",
      "title": "My Project",
      "isOwner": true,
      "myRole": null,
      "linkedCollaborators": [...]
    },
    {
      "_id": "project456",
      "title": "Collaborated Project",
      "isOwner": false,
      "myRole": "Frontend Developer",
      "linkedCollaborators": [...]
    }
  ]
}
```

Each project includes:
- `isOwner`: `true` if user owns project, `false` if collaborator
- `myRole`: Role name if collaborator, `null` if owner
- `linkedCollaborators`: Array of all collaborators with their details

---

## Database Schema

### CollaborationRequest Model

```javascript
{
  projectId: ObjectId (ref: Project),
  projectOwnerId: ObjectId (ref: User),
  requestedUserId: ObjectId (ref: User),
  role: String (max 100 chars),
  message: String (max 500 chars),
  status: Enum ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
  respondedAt: Date,
  rejectionReason: String (max 500 chars),
  createdAt: Date,
  updatedAt: Date
}
```

### Project Model Updates

```javascript
{
  // ... existing fields ...
  
  // Legacy text-based collaborators (backward compatible)
  collaborators: [{
    name: String,
    role: String,
    email: String
  }],
  
  // New: Linked verified collaborators
  linkedCollaborators: [{
    userId: ObjectId (ref: User),
    role: String,
    addedAt: Date
  }]
}
```

---

## Error Codes

| Code | Message |
|------|---------|
| 400 | Search query too short |
| 400 | Project ID, user ID, and role required |
| 400 | Cannot invite yourself |
| 400 | Maximum 5 collaborators allowed |
| 400 | User already a collaborator |
| 400 | Pending request already exists |
| 400 | Project has reached maximum collaborators |
| 403 | Not project owner |
| 404 | Project not found |
| 404 | User not found |
| 404 | Request not found |
| 500 | Server error |

---

## Frontend Integration Examples

### Search and Invite Flow

```javascript
// 1. Search for users
const searchUsers = async (query) => {
  const response = await fetch(`/api/collaborations/search-users?query=${query}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  return response.json();
};

// 2. Send collaboration request
const sendRequest = async (projectId, userId, role, message) => {
  const response = await fetch('/api/collaborations/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ projectId, requestedUserId: userId, role, message })
  });
  return response.json();
};
```

### Accept/Reject Flow

```javascript
// Get incoming requests
const getIncomingRequests = async () => {
  const response = await fetch('/api/collaborations/requests/incoming', {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  return response.json();
};

// Accept request
const acceptRequest = async (requestId) => {
  const response = await fetch(`/api/collaborations/requests/${requestId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` }
  });
  return response.json();
};

// Reject request
const rejectRequest = async (requestId, reason) => {
  const response = await fetch(`/api/collaborations/requests/${requestId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ reason })
  });
  return response.json();
};
```

---

## Business Rules

1. **Maximum Collaborators**: Each project can have maximum 5 collaborators
2. **Owner Permissions**: Only project owner can:
   - Send collaboration requests
   - Cancel pending requests
   - Remove collaborators
3. **Collaborator Permissions**: Collaborators can:
   - View the project in their portfolio
   - Display their role on the project
4. **Request States**:
   - PENDING: Initial state, awaiting response
   - ACCEPTED: User accepted, added to project
   - REJECTED: User declined invitation
   - CANCELLED: Owner cancelled before response
5. **Portfolio Visibility**: Projects appear in collaborator's portfolio only if:
   - Request was accepted
   - Project is set to public
   - User is in linkedCollaborators array

---

## Notes

- Legacy text-based `collaborators` field is maintained for backward compatibility
- New `linkedCollaborators` field links to actual User accounts
- Portfolio automatically shows both owned and collaborated projects
- No duplicate pending requests allowed per project-user combination
