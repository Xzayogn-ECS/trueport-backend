# Events System API Documentation

## Overview
The Events System allows Institute Admins and Verifiers (teachers/faculty) to create institutional events, select students as participants/awardees, and automatically push verified experiences to students' portfolios.

## Features
- ✅ Create and manage institutional events
- ✅ Support multiple event types (competitions, hackathons, workshops, awards, etc.)
- ✅ Add/remove participants and awardees
- ✅ Auto-push verified experiences to students
- ✅ Track certificates and awards
- ✅ Team-based events support
- ✅ Public event listing for students

## Authentication
All event management endpoints require authentication:
- **Institute Admin**: Full access to all events in their institution
- **Verifier (Teacher/Faculty)**: Full access to all events in their institution
- **Student**: Read-only access to public events

Include the JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## API Endpoints

### 1. Create Event
**POST** `/api/events`

Create a new event with details.

**Access:** Institute Admin, Verifier

**Request Body:**
```json
{
  "title": "Annual Hackathon 2025",
  "description": "24-hour coding competition focusing on AI and ML projects",
  "eventType": "HACKATHON",
  "organizer": {
    "name": "CS Department",
    "email": "cs@university.edu"
  },
  "startDate": "2025-03-15T09:00:00Z",
  "endDate": "2025-03-16T09:00:00Z",
  "location": "Main Auditorium",
  "tags": ["AI", "ML", "Coding", "Competition"],
  "attachments": ["https://cloudinary.com/event-banner.jpg"],
  "awards": [
    {
      "position": "1st Place",
      "title": "Champion",
      "description": "$5000 prize and internship opportunity"
    },
    {
      "position": "2nd Place",
      "title": "Runner Up",
      "description": "$2000 prize"
    },
    {
      "position": "Participant",
      "title": "Participation Certificate",
      "description": "Certificate of participation"
    }
  ],
  "status": "DRAFT",
  "isPublic": true
}
```

**Event Types:**
- `COMPETITION`
- `HACKATHON`
- `WORKSHOP`
- `SEMINAR`
- `CONFERENCE`
- `AWARD`
- `SPORTS`
- `CULTURAL`
- `ACADEMIC`
- `RESEARCH`
- `OTHER`

**Status:**
- `DRAFT` - Event is being created
- `PUBLISHED` - Event is visible to students
- `COMPLETED` - Event has finished
- `CANCELLED` - Event was cancelled

**Response:**
```json
{
  "message": "Event created successfully",
  "event": {
    "_id": "event_id",
    "title": "Annual Hackathon 2025",
    "institution": "MIT",
    "createdBy": {
      "adminId": "admin_id",
      "adminType": "INSTITUTE_ADMIN",
      "name": "John Doe",
      "email": "john@university.edu"
    },
    // ... other fields
  }
}
```

---

### 2. Get All Events
**GET** `/api/events`

Retrieve all events (including drafts) for the institution.

**Access:** Institute Admin, Verifier

**Query Parameters:**
- `status` (optional): Filter by status (DRAFT, PUBLISHED, COMPLETED, CANCELLED)
- `eventType` (optional): Filter by event type
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20): Items per page
- `search` (optional): Search in title and description

**Example:**
```
GET /api/events?status=PUBLISHED&eventType=HACKATHON&page=1&limit=10
```

**Response:**
```json
{
  "events": [
    {
      "_id": "event_id",
      "title": "Annual Hackathon 2025",
      "eventType": "HACKATHON",
      "startDate": "2025-03-15T09:00:00Z",
      "participants": [
        {
          "userId": {
            "_id": "user_id",
            "name": "Jane Smith",
            "email": "jane@student.edu"
          },
          "role": "Participant",
          "position": "1st Place"
        }
      ]
      // ... other fields
    }
  ],
  "totalPages": 5,
  "currentPage": 1,
  "totalEvents": 47
}
```

---

### 3. Get Single Event
**GET** `/api/events/:eventId`

Get detailed information about a specific event.

**Access:** Institute Admin, Verifier

**Response:**
```json
{
  "event": {
    "_id": "event_id",
    "title": "Annual Hackathon 2025",
    "description": "...",
    "participants": [
      {
        "userId": {
          "_id": "user_id",
          "name": "Jane Smith",
          "email": "jane@student.edu",
          "institute": "MIT"
        },
        "role": "Winner",
        "position": "1st Place",
        "teamName": "Code Warriors",
        "certificate": "https://cloudinary.com/cert123.pdf",
        "experienceCreated": true,
        "experienceId": "exp_id",
        "addedAt": "2025-03-20T10:00:00Z"
      }
    ],
    "experiencesPushedCount": 25,
    "experiencesPushedAt": "2025-03-20T10:30:00Z"
    // ... other fields
  }
}
```

---

### 4. Update Event
**PUT** `/api/events/:eventId`

Update event details.

**Access:** Institute Admin, Verifier (same institution)

**Request Body:** (All fields optional)
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "PUBLISHED",
  "tags": ["Updated", "Tags"]
}
```

**Response:**
```json
{
  "message": "Event updated successfully",
  "event": { /* updated event object */ }
}
```

---

### 5. Delete Event
**DELETE** `/api/events/:eventId`

Delete an event permanently.

**Access:** Institute Admin, Verifier (same institution)

**Response:**
```json
{
  "message": "Event deleted successfully"
}
```

---

### 6. Add Participants to Event
**POST** `/api/events/:eventId/participants`

Add multiple students as participants/awardees to an event.

**Access:** Institute Admin, Verifier

**Request Body:**
```json
{
  "participants": [
    {
      "userId": "user_id_1",
      "role": "Winner",
      "position": "1st Place",
      "teamName": "Code Warriors",
      "certificate": "https://cloudinary.com/cert1.pdf"
    },
    {
      "userId": "user_id_2",
      "role": "Participant",
      "position": "2nd Place",
      "teamName": "Tech Titans"
    },
    {
      "userId": "user_id_3",
      "role": "Participant"
    }
  ]
}
```

**Fields:**
- `userId` (required): Student's user ID
- `role` (optional, default: "Participant"): Role in the event
- `position` (optional): Award/position received
- `teamName` (optional): Team name if applicable
- `certificate` (optional): Individual certificate URL

**Response:**
```json
{
  "message": "Participants processed",
  "addedCount": 3,
  "added": ["user_id_1", "user_id_2", "user_id_3"],
  "errors": []
}
```

**Error Handling:**
If some participants fail to be added:
```json
{
  "message": "Participants processed",
  "addedCount": 2,
  "added": ["user_id_1", "user_id_2"],
  "errors": [
    {
      "participant": { "userId": "user_id_3" },
      "error": "User does not belong to your institution"
    }
  ]
}
```

---

### 7. Remove Participant from Event
**DELETE** `/api/events/:eventId/participants/:userId`

Remove a specific participant from an event.

**Access:** Institute Admin, Verifier

**Response:**
```json
{
  "message": "Participant removed successfully"
}
```

---

### 8. Push Experiences to Students ⭐
**POST** `/api/events/:eventId/push-experiences`

Automatically create verified experiences for all or selected participants.

**Access:** Institute Admin, Verifier

**Request Body:** (All fields optional)
```json
{
  "userIds": ["user_id_1", "user_id_2"],
  "customDescription": "Custom description for the experience",
  "customRole": "Custom role title"
}
```

**Fields:**
- `userIds` (optional): Array of user IDs. If not provided, pushes to ALL participants
- `customDescription` (optional): Override the default experience description
- `customRole` (optional): Override the participant's role

**Default Behavior:**
- If no fields provided, creates experiences for ALL participants using event details
- Experiences are automatically marked as **verified**
- Verifier name is recorded
- Each participant's position and team name are included in description
- Individual certificates are added to attachments

**Response:**
```json
{
  "message": "Experiences push completed",
  "results": {
    "total": 25,
    "success": 23,
    "failed": 0,
    "skipped": 2
  },
  "details": {
    "success": [
      {
        "userId": "user_id_1",
        "name": "Jane Smith",
        "experienceId": "exp_id_1"
      },
      {
        "userId": "user_id_2",
        "name": "John Doe",
        "experienceId": "exp_id_2"
      }
    ],
    "failed": [],
    "skipped": [
      {
        "userId": "user_id_3",
        "name": "Bob Wilson",
        "reason": "Experience already exists",
        "experienceId": "existing_exp_id"
      }
    ]
  }
}
```

**What Gets Created:**
Each participant receives a verified Experience entry with:
- **Title**: Event title
- **Description**: Event description + position + team name
- **Role**: Participant's role (e.g., "1st Place - Winner")
- **Start/End Dates**: Event dates
- **Tags**: Event tags
- **Attachments**: Participant's certificate + event attachments
- **Verified**: true (auto-verified)
- **VerifiedBy**: Admin/Verifier name
- **VerifierComment**: "Auto-verified: Created from institutional event..."

---

### 9. Get Public Events (Students)
**GET** `/api/events/public/list`

Students can view published public events from their institution.

**Access:** Any authenticated student

**Query Parameters:**
- `eventType` (optional): Filter by event type
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20): Items per page
- `search` (optional): Search in title and description

**Response:**
```json
{
  "events": [
    {
      "_id": "event_id",
      "title": "Annual Hackathon 2025",
      "description": "...",
      "eventType": "HACKATHON",
      "startDate": "2025-03-15T09:00:00Z",
      "endDate": "2025-03-16T09:00:00Z",
      "location": "Main Auditorium",
      "tags": ["AI", "ML"]
      // Note: participants list is hidden
    }
  ],
  "totalPages": 3,
  "currentPage": 1,
  "totalEvents": 28
}
```

---

### 10. Get My Events (Students)
**GET** `/api/events/my/events`

Students can view events where they are participants.

**Access:** Any authenticated student

**Response:**
```json
{
  "events": [
    {
      "_id": "event_id",
      "title": "Annual Hackathon 2025",
      "description": "...",
      "eventType": "HACKATHON",
      "startDate": "2025-03-15T09:00:00Z",
      "participants": [
        {
          "userId": "current_user_id",
          "role": "Winner",
          "position": "1st Place",
          "teamName": "Code Warriors",
          "experienceCreated": true
        }
      ]
    }
  ]
}
```

---

## Complete Workflow Example

### Scenario: Creating a Hackathon and Pushing Experiences

#### Step 1: Create Event
```bash
POST /api/events
{
  "title": "AI Hackathon 2025",
  "description": "24-hour AI/ML coding competition",
  "eventType": "HACKATHON",
  "startDate": "2025-03-15T09:00:00Z",
  "endDate": "2025-03-16T09:00:00Z",
  "status": "DRAFT",
  "awards": [
    {"position": "1st Place", "title": "Champion"},
    {"position": "2nd Place", "title": "Runner Up"},
    {"position": "Participant", "title": "Certificate"}
  ]
}
```

#### Step 2: Add Participants
```bash
POST /api/events/{eventId}/participants
{
  "participants": [
    {
      "userId": "user1",
      "role": "Winner",
      "position": "1st Place",
      "teamName": "AI Warriors"
    },
    {
      "userId": "user2",
      "role": "Participant",
      "position": "2nd Place",
      "teamName": "ML Masters"
    },
    {
      "userId": "user3",
      "role": "Participant"
    }
  ]
}
```

#### Step 3: Publish Event
```bash
PUT /api/events/{eventId}
{
  "status": "PUBLISHED"
}
```

#### Step 4: Push Verified Experiences
```bash
POST /api/events/{eventId}/push-experiences
{
  // Empty body = push to all participants
}
```

#### Result:
- All 3 students automatically receive verified experience entries
- Each experience includes their position, team name, and role
- Experiences appear in student portfolios as verified
- Students can showcase these achievements immediately

---

## Error Codes

- `400` - Bad Request (missing required fields, invalid data)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions, wrong institution)
- `404` - Not Found (event or user not found)
- `500` - Internal Server Error

## Notes

1. **Auto-Verification**: All experiences pushed from events are automatically verified
2. **Duplicate Prevention**: System prevents creating duplicate experiences for the same participant
3. **Institution Isolation**: Admins/Verifiers can only manage events within their institution
4. **Flexible Roles**: Support for various roles (Winner, Participant, Organizer, etc.)
5. **Team Support**: Track team-based competitions with team names
6. **Certificate Management**: Individual and event-wide certificate attachments

## Database Models

### Event Schema Fields
- Basic Info: title, description, eventType, institution
- Dates: startDate, endDate
- Organization: organizer, location, tags, attachments
- Awards: array of award positions and descriptions
- Participants: array with userId, role, position, teamName, certificate
- Metadata: createdBy, status, isPublic, statistics

### Created Experience Fields (Auto-verified)
- userId, title, description, role
- startDate, endDate, tags, attachments
- **verified: true**
- **verifiedBy: admin/verifier name**
- **verifierComment: auto-verification note**
