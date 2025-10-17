# Events System - Quick Start Guide

## For Institute Admins and Teachers

### What is the Events System?

The Events System allows you to:
- 📋 Create institutional events (competitions, hackathons, workshops, awards, etc.)
- 👥 Select students as participants or award winners
- ✅ Automatically add verified experiences to students' portfolios
- 🏆 Track certificates and achievements
- 🎯 Save time by bulk-creating verified experiences

---

## Quick Start

### 1. Create an Event

```javascript
// Login as Institute Admin or Verifier
POST /api/events
{
  "title": "Tech Fest 2025",
  "description": "Annual technology festival",
  "eventType": "COMPETITION",
  "startDate": "2025-04-01",
  "endDate": "2025-04-03"
}
```

### 2. Add Students

```javascript
POST /api/events/{eventId}/participants
{
  "participants": [
    {
      "userId": "student_id",
      "role": "Winner",
      "position": "1st Place"
    }
  ]
}
```

### 3. Push Verified Experiences

```javascript
// This creates verified experience entries for all participants
POST /api/events/{eventId}/push-experiences
```

**Done!** Students now have verified experiences in their portfolios.

---

## Common Use Cases

### Use Case 1: Competition with Winners

```javascript
// 1. Create competition event
{
  "title": "Code Sprint 2025",
  "eventType": "COMPETITION",
  "startDate": "2025-03-15",
  "awards": [
    { "position": "1st Place", "title": "Gold Medal" },
    { "position": "2nd Place", "title": "Silver Medal" }
  ]
}

// 2. Add winners with positions
{
  "participants": [
    { "userId": "alice_id", "position": "1st Place", "role": "Winner" },
    { "userId": "bob_id", "position": "2nd Place", "role": "Winner" },
    { "userId": "charlie_id", "role": "Participant" }
  ]
}

// 3. Push experiences
// Each student gets an experience with their specific position/role
```

### Use Case 2: Workshop/Seminar

```javascript
// 1. Create workshop
{
  "title": "AI Workshop Series",
  "eventType": "WORKSHOP",
  "startDate": "2025-02-10",
  "endDate": "2025-02-12"
}

// 2. Add all attendees
{
  "participants": [
    { "userId": "student1", "role": "Participant" },
    { "userId": "student2", "role": "Participant" }
    // ... add all students
  ]
}

// 3. Push certificate of participation to all
```

### Use Case 3: Team-based Hackathon

```javascript
// 1. Create hackathon
{
  "title": "Hack@University 2025",
  "eventType": "HACKATHON"
}

// 2. Add teams with team names
{
  "participants": [
    { "userId": "alice", "position": "1st Place", "teamName": "Code Warriors" },
    { "userId": "bob", "position": "1st Place", "teamName": "Code Warriors" },
    { "userId": "charlie", "position": "2nd Place", "teamName": "Tech Titans" }
  ]
}

// 3. Push experiences (includes team name in description)
```

### Use Case 4: Award Ceremony

```javascript
// 1. Create award event
{
  "title": "Annual Excellence Awards",
  "eventType": "AWARD",
  "awards": [
    { "position": "Best Student", "title": "Academic Excellence" },
    { "position": "Best Project", "title": "Innovation Award" }
  ]
}

// 2. Add awardees
{
  "participants": [
    { "userId": "student1", "position": "Best Student", "role": "Awardee" },
    { "userId": "student2", "position": "Best Project", "role": "Awardee" }
  ]
}

// 3. Push to selected students only
{
  "userIds": ["student1", "student2"]
}
```

---

## Features Explained

### Auto-Verification
✅ All experiences created from events are **automatically verified**
- No need for separate verification process
- Your name is recorded as the verifier
- Includes auto-verification comment

### Smart Description Building
The system automatically creates rich descriptions:
```
Event Description
+ Position/Award: 1st Place
+ Team: Code Warriors
```

### Certificate Management
- Upload event-wide certificates (attached to all)
- Add individual participant certificates
- Both appear in student's experience attachments

### Duplicate Prevention
- Won't create duplicate experiences
- Tracks which students already have experiences
- Shows skipped students in results

### Flexible Roles
Support for various roles:
- Winner, Champion, Awardee
- Participant, Attendee
- Organizer, Volunteer
- Team Member, Captain
- Any custom role you define

---

## API Endpoints Summary

| Action | Method | Endpoint |
|--------|--------|----------|
| Create event | POST | `/api/events` |
| List events | GET | `/api/events` |
| Get event details | GET | `/api/events/:id` |
| Update event | PUT | `/api/events/:id` |
| Delete event | DELETE | `/api/events/:id` |
| Add participants | POST | `/api/events/:id/participants` |
| Remove participant | DELETE | `/api/events/:id/participants/:userId` |
| **Push experiences** | **POST** | **`/api/events/:id/push-experiences`** |

---

## Best Practices

### 1. Start with DRAFT Status
Create events as DRAFT, add all participants, then change to PUBLISHED:
```javascript
// Create as draft
{ "status": "DRAFT" }

// After adding participants, publish
PUT /api/events/{id}
{ "status": "PUBLISHED" }
```

### 2. Add Participants Before Pushing
Always add all participants before pushing experiences:
```javascript
// ❌ Wrong order
POST /api/events/{id}/push-experiences
POST /api/events/{id}/participants

// ✅ Correct order
POST /api/events/{id}/participants
POST /api/events/{id}/push-experiences
```

### 3. Use Descriptive Roles and Positions
```javascript
// ❌ Vague
{ "role": "Student", "position": "1" }

// ✅ Clear
{ "role": "Winner", "position": "1st Place - Best Innovation" }
```

### 4. Include Tags for Searchability
```javascript
{
  "tags": ["AI", "Machine Learning", "Python", "Competition"]
}
```

### 5. Upload Certificates Before Pushing
```javascript
{
  "attachments": ["https://cloudinary.com/event-cert.pdf"],
  "participants": [
    { "userId": "...", "certificate": "https://cloudinary.com/individual-cert.pdf" }
  ]
}
```

---

## Troubleshooting

### "User does not belong to your institution"
- You can only add students from your own institution
- Verify the student's institute field matches yours

### "Participant not found in event"
- The user hasn't been added to the event yet
- Use GET /api/events/:id to check current participants

### "Experience already exists"
- The system has already created an experience for this participant
- Check the response details for skipped students
- Use GET /api/events/:id to see experienceCreated status

### Experiences not showing for students
- Ensure you called the push-experiences endpoint
- Check that the event status allows experience creation
- Verify students are properly added as participants

---

## Students' Perspective

### What Students See

1. **Public Events**: All published events are visible
   - GET `/api/events/public/list`

2. **My Events**: Events where they are participants
   - GET `/api/events/my/events`

3. **Automatic Experiences**: When you push experiences:
   - Appears in their portfolio immediately
   - Marked as verified (no action needed)
   - Includes all details (position, team, certificates)
   - Ready to showcase to recruiters

### Student Benefits
- ✅ No manual entry needed
- ✅ Instant verification
- ✅ Professional documentation
- ✅ Consistent formatting
- ✅ Official institutional backing

---

## Migration from Manual Verification

### Before (Manual Process):
1. Student creates experience
2. Student uploads proof
3. Verifier reviews request
4. Verifier approves/rejects
5. Student gets notification
⏱️ **Time: Days/Weeks**

### After (Events System):
1. Admin creates event
2. Admin adds participants
3. Admin pushes experiences
✅ **Time: Minutes**
🎯 **Auto-verified, no student action needed**

---

## Security & Permissions

### Who Can Do What:

**Institute Admin**
- ✅ Create/edit/delete all events
- ✅ Add/remove any students
- ✅ Push experiences

**Verifier (Teacher/Faculty)**
- ✅ Create/edit/delete all events
- ✅ Add/remove any students
- ✅ Push experiences

**Student**
- ✅ View public events
- ✅ View their own participations
- ❌ Cannot create/edit events
- ❌ Cannot push experiences

### Data Isolation
- Each institution's data is completely isolated
- You can only access events from your institution
- Students from other institutions cannot be added

---

## Need Help?

For detailed API documentation, see [EVENTS_SYSTEM.md](./EVENTS_SYSTEM.md)

For system architecture, see [README.md](./README.md)
