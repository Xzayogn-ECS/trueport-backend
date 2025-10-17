# Experience Model - Organization Field Update

## Overview
Added a required `organization` field to the Experience model to track the company/organization where the experience was gained.

## Changes Made

### 1. Model Update (`src/models/Experience.js`)
- **Added Field**: `organization` (String, required, max 200 characters)
- **Position**: Added between `role` and `startDate` fields
- **Validation**: Trimmed and required

```javascript
organization: {
  type: String,
  required: true,
  trim: true,
  maxLength: 200
}
```

### 2. API Route Updates (`src/routes/experiences.js`)

#### POST `/` - Create Experience
- **Request Body**: Now requires `organization` field
- **Validation**: Updated error message to include organization
- **Example Request**:
```json
{
  "title": "Software Developer Intern",
  "description": "Developed web applications...",
  "role": "Backend Developer",
  "organization": "Tech Company Inc.",
  "startDate": "2024-01-01",
  "endDate": "2024-06-30",
  "tags": ["Node.js", "MongoDB"],
  "attachments": []
}
```

#### PUT `/:id` - Update Experience
- **Allowed Updates**: Added `organization` to the list of updatable fields
- **Fields**: `['title', 'description', 'role', 'organization', 'startDate', 'endDate', 'tags', 'attachments']`

### 3. Other Route Updates

#### `src/routes/users.js`
- **GET `/profile/items`**: Updated select statement to include `organization`
- **Selection**: `'title description role organization startDate endDate verified isPublic verifierName verifierOrganization createdAt'`

#### `src/routes/verifier.js`
- **GET `/students/:userId/items`**: Updated select statement to include `organization` and `role`
- **Selection**: `'title description role organization verified verifiedBy verifiedAt verifierName verifierOrganization createdAt'`

#### `src/routes/portfolio.js`
- **No changes needed**: Uses full document queries without `.select()`, so automatically includes new field

## Migration Notes

### Existing Data
⚠️ **Important**: Existing experience records in the database do NOT have the `organization` field and will fail validation when accessed.

### Migration Options:

#### Option 1: Make Field Optional (Recommended for smooth transition)
```javascript
organization: {
  type: String,
  required: false,  // Change to optional
  trim: true,
  maxLength: 200
}
```

#### Option 2: Database Migration Script
Create a script to update all existing experiences:
```javascript
const Experience = require('./models/Experience');

async function migrateExperiences() {
  await Experience.updateMany(
    { organization: { $exists: false } },
    { $set: { organization: 'Not Specified' } }
  );
  console.log('Migration complete');
}
```

#### Option 3: Default Value
```javascript
organization: {
  type: String,
  required: true,
  trim: true,
  maxLength: 200,
  default: 'Not Specified'
}
```

## API Documentation Updates Needed

### POST /api/experiences
**Request Body** (updated):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | String | Yes | Experience title |
| description | String | Yes | Detailed description |
| role | String | Yes | Your role/position |
| **organization** | **String** | **Yes** | **Company/Organization name** |
| startDate | Date | Yes | Start date (ISO format) |
| endDate | Date | No | End date (ISO format) |
| tags | Array | No | Array of skill tags |
| attachments | Array | No | Array of attachment URLs |

### PUT /api/experiences/:id
**Updatable Fields** (updated):
- title
- description
- role
- **organization** (new)
- startDate
- endDate
- tags
- attachments

## Response Format Changes

All experience objects now include the `organization` field:

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "userId": "507f1f77bcf86cd799439012",
  "title": "Software Developer Intern",
  "description": "Developed web applications...",
  "role": "Backend Developer",
  "organization": "Tech Company Inc.",
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-06-30T00:00:00.000Z",
  "tags": ["Node.js", "MongoDB"],
  "verified": false,
  "isPublic": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Frontend Changes Required

### Forms
1. Add "Organization" input field to create/edit experience forms
2. Update form validation to require organization
3. Update placeholder text: "e.g., Google, Microsoft, Startup Inc."

### Display Components
1. Update experience cards to show organization
2. Layout suggestion: Show organization below or next to role
3. Example format: `"Role at Organization"` or `"Role • Organization"`

### API Calls
1. Include `organization` in POST request body
2. Include `organization` in PUT request body if updating
3. Update TypeScript interfaces/types if using TypeScript

## Testing Checklist

- [ ] Create new experience with organization - should succeed
- [ ] Create new experience without organization - should fail with validation error
- [ ] Update existing experience to add organization
- [ ] View experiences in profile - organization displays correctly
- [ ] View experiences in portfolio - organization displays correctly
- [ ] Verifier can see organization in verification requests
- [ ] Filter/search by organization (if implemented)

## Rollback Plan

If issues occur, revert these files:
1. `src/models/Experience.js` - Remove organization field
2. `src/routes/experiences.js` - Remove organization from validation and creation
3. `src/routes/users.js` - Remove organization from select
4. `src/routes/verifier.js` - Remove organization from select

## Notes

- The `organization` field is a free-text field, not a reference to Institution model
- This allows flexibility for users to enter any organization name
- Future enhancement: Could add autocomplete with Institution model
- Consider adding organization validation/normalization in future
