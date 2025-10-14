# Custom URLs Feature - Documentation

## Overview
The Custom URLs feature allows users to add multiple custom links to their profile, such as Behance, Medium, LeetCode, personal websites, or any other online presence. These links appear in their public portfolio and can be managed with full CRUD operations.

---

## Features

✅ **Add Unlimited URLs** (with configurable max limit of 20)  
✅ **Custom Labels** - Name each link (e.g., "Behance Portfolio", "Medium Blog")  
✅ **Optional Icons** - Add icon identifiers for frontend styling  
✅ **Visibility Control** - Show/hide individual links or entire section  
✅ **Custom Ordering** - Reorder links as desired  
✅ **Validation** - URL format validation and security  
✅ **Portfolio Integration** - Automatically displayed in public portfolios  

---

## Database Schema

### User Model - Custom URLs Field

```javascript
customUrls: [{
  label: {
    type: String,
    required: true,
    trim: true,
    maxLength: 50 // e.g., "Behance", "Medium", "LeetCode"
  },
  url: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Please enter a valid URL (must start with http:// or https://)'
    }
  },
  icon: {
    type: String,
    trim: true,
    maxLength: 50 // Optional: icon name (e.g., "behance", "medium", "code")
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0 // For custom ordering
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}]
```

### Contact Visibility Update

```javascript
contactVisibility: {
  email: Boolean,
  phone: Boolean,
  linkedinUrl: Boolean,
  githubUsername: Boolean,
  customUrls: Boolean // NEW: Controls entire custom URLs section visibility
}
```

---

## API Endpoints

### 1. Get All Custom URLs
**GET** `/api/users/me/custom-urls`

Get all custom URLs for the authenticated user.

**Authentication:** Required

**Response:**
```json
{
  "customUrls": [
    {
      "_id": "url_id_1",
      "label": "Behance Portfolio",
      "url": "https://behance.net/username",
      "icon": "behance",
      "isVisible": true,
      "order": 0,
      "createdAt": "2025-10-09T10:00:00Z"
    },
    {
      "_id": "url_id_2",
      "label": "Medium Blog",
      "url": "https://medium.com/@username",
      "icon": "medium",
      "isVisible": true,
      "order": 1,
      "createdAt": "2025-10-09T10:05:00Z"
    }
  ],
  "isVisible": true
}
```

---

### 2. Add Custom URL
**POST** `/api/users/me/custom-urls`

Add a new custom URL to the user's profile.

**Authentication:** Required

**Request Body:**
```json
{
  "label": "LeetCode Profile",
  "url": "https://leetcode.com/username",
  "icon": "code",
  "isVisible": true
}
```

**Required Fields:**
- `label` - The display name (max 50 characters)
- `url` - The URL (must start with http:// or https://)

**Optional Fields:**
- `icon` - Icon identifier (max 50 characters)
- `isVisible` - Whether to show this link (default: true)

**Response:**
```json
{
  "message": "Custom URL added successfully",
  "customUrl": {
    "_id": "new_url_id",
    "label": "LeetCode Profile",
    "url": "https://leetcode.com/username",
    "icon": "code",
    "isVisible": true,
    "order": 2,
    "createdAt": "2025-10-09T10:10:00Z"
  }
}
```

**Validation Errors:**
- `400` - Label is required
- `400` - Label must be less than 50 characters
- `400` - URL is required
- `400` - Invalid URL format (must start with http:// or https://)
- `400` - Maximum 20 custom URLs allowed

---

### 3. Update Custom URL
**PUT** `/api/users/me/custom-urls/:urlId`

Update an existing custom URL.

**Authentication:** Required

**URL Parameters:**
- `urlId` - The ID of the custom URL to update

**Request Body:** (all fields optional)
```json
{
  "label": "Updated Label",
  "url": "https://updated-url.com",
  "icon": "new-icon",
  "isVisible": false,
  "order": 5
}
```

**Response:**
```json
{
  "message": "Custom URL updated successfully",
  "customUrl": {
    "_id": "url_id",
    "label": "Updated Label",
    "url": "https://updated-url.com",
    "icon": "new-icon",
    "isVisible": false,
    "order": 5,
    "createdAt": "2025-10-09T10:00:00Z"
  }
}
```

**Error Responses:**
- `404` - Custom URL not found
- `400` - Validation errors

---

### 4. Delete Custom URL
**DELETE** `/api/users/me/custom-urls/:urlId`

Delete a specific custom URL.

**Authentication:** Required

**URL Parameters:**
- `urlId` - The ID of the custom URL to delete

**Response:**
```json
{
  "message": "Custom URL deleted successfully",
  "customUrls": [
    // Remaining custom URLs
  ]
}
```

**Error Responses:**
- `404` - User not found

---

### 5. Reorder Custom URLs
**PUT** `/api/users/me/custom-urls/reorder`

Reorder custom URLs by providing an array of IDs in the desired order.

**Authentication:** Required

**Request Body:**
```json
{
  "orderedIds": [
    "url_id_3",
    "url_id_1",
    "url_id_2"
  ]
}
```

**Response:**
```json
{
  "message": "Custom URLs reordered successfully",
  "customUrls": [
    {
      "_id": "url_id_3",
      "label": "First Link",
      "order": 0,
      // ...
    },
    {
      "_id": "url_id_1",
      "label": "Second Link",
      "order": 1,
      // ...
    },
    {
      "_id": "url_id_2",
      "label": "Third Link",
      "order": 2,
      // ...
    }
  ]
}
```

---

### 6. Toggle Custom URLs Visibility
**PUT** `/api/users/me/custom-urls/visibility`

Show or hide the entire custom URLs section in the public portfolio.

**Authentication:** Required

**Request Body:**
```json
{
  "isVisible": false
}
```

**Response:**
```json
{
  "message": "Custom URLs visibility updated successfully",
  "isVisible": false
}
```

---

## Portfolio Integration

### Public Portfolio Response

When custom URLs visibility is enabled and URLs exist, they appear in the portfolio:

**GET** `/api/portfolio/:userId`

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "bio": "...",
    "contactInfo": {
      "email": "john@example.com",
      "linkedinUrl": "https://linkedin.com/in/johndoe",
      "githubUsername": "johndoe",
      "customUrls": [
        {
          "label": "Behance Portfolio",
          "url": "https://behance.net/johndoe",
          "icon": "behance"
        },
        {
          "label": "Medium Blog",
          "url": "https://medium.com/@johndoe",
          "icon": "medium"
        },
        {
          "label": "LeetCode",
          "url": "https://leetcode.com/johndoe",
          "icon": "code"
        }
      ]
    }
  },
  "experiences": [...],
  "education": [...],
  "projects": [...]
}
```

**Note:** Custom URLs in portfolio:
- Only visible URLs (`isVisible: true`) are shown
- Sorted by `order` field
- Only includes `label`, `url`, and `icon` (no internal IDs)
- Respects overall custom URLs visibility setting

---

## Usage Examples

### Example 1: Add Design Portfolio Links

```javascript
// 1. Add Behance
POST /api/users/me/custom-urls
{
  "label": "Behance Portfolio",
  "url": "https://behance.net/username",
  "icon": "behance"
}

// 2. Add Dribbble
POST /api/users/me/custom-urls
{
  "label": "Dribbble Profile",
  "url": "https://dribbble.com/username",
  "icon": "dribbble"
}

// 3. Add Personal Website
POST /api/users/me/custom-urls
{
  "label": "Personal Website",
  "url": "https://myportfolio.com",
  "icon": "globe"
}
```

---

### Example 2: Add Developer Links

```javascript
// 1. Add LeetCode
POST /api/users/me/custom-urls
{
  "label": "LeetCode Profile",
  "url": "https://leetcode.com/username",
  "icon": "code"
}

// 2. Add CodePen
POST /api/users/me/custom-urls
{
  "label": "CodePen",
  "url": "https://codepen.io/username",
  "icon": "codepen"
}

// 3. Add Stack Overflow
POST /api/users/me/custom-urls
{
  "label": "Stack Overflow",
  "url": "https://stackoverflow.com/users/12345/username",
  "icon": "stackoverflow"
}
```

---

### Example 3: Add Content Creator Links

```javascript
// 1. Add Medium Blog
POST /api/users/me/custom-urls
{
  "label": "Medium Blog",
  "url": "https://medium.com/@username",
  "icon": "medium"
}

// 2. Add YouTube Channel
POST /api/users/me/custom-urls
{
  "label": "YouTube Channel",
  "url": "https://youtube.com/@username",
  "icon": "youtube"
}

// 3. Add Dev.to
POST /api/users/me/custom-urls
{
  "label": "Dev.to Blog",
  "url": "https://dev.to/username",
  "icon": "dev"
}
```

---

### Example 4: Update and Reorder

```javascript
// 1. Update a URL
PUT /api/users/me/custom-urls/url_id_1
{
  "label": "Updated Label",
  "url": "https://new-url.com"
}

// 2. Hide a specific URL
PUT /api/users/me/custom-urls/url_id_2
{
  "isVisible": false
}

// 3. Reorder URLs
PUT /api/users/me/custom-urls/reorder
{
  "orderedIds": ["url_id_3", "url_id_1", "url_id_2"]
}

// 4. Hide entire section
PUT /api/users/me/custom-urls/visibility
{
  "isVisible": false
}
```

---

## Common URL Patterns

### Popular Platforms

```javascript
// Design Platforms
Behance:      https://behance.net/username
Dribbble:     https://dribbble.com/username
Adobe:        https://portfolio.adobe.com/username

// Developer Platforms
LeetCode:     https://leetcode.com/username
HackerRank:   https://hackerrank.com/username
CodePen:      https://codepen.io/username
CodeSandbox:  https://codesandbox.io/u/username
Replit:       https://replit.com/@username

// Content Platforms
Medium:       https://medium.com/@username
Dev.to:       https://dev.to/username
Hashnode:     https://hashnode.com/@username
Substack:     https://username.substack.com

// Social/Professional
Twitter:      https://twitter.com/username
Instagram:    https://instagram.com/username
YouTube:      https://youtube.com/@username
Twitch:       https://twitch.tv/username

// Academic/Research
ResearchGate: https://researchgate.net/profile/username
ORCID:        https://orcid.org/0000-0000-0000-0000
Google Scholar: https://scholar.google.com/citations?user=ID

// Other
Personal Site: https://yourdomain.com
Notion:       https://notion.so/username
Linktree:     https://linktr.ee/username
```

---

## Frontend Integration

### Display Custom URLs

```html
<!-- Example HTML/React Component -->
<div class="custom-urls">
  <h3>Connect With Me</h3>
  <div class="url-list">
    {customUrls.map(url => (
      <a 
        href={url.url} 
        target="_blank" 
        rel="noopener noreferrer"
        class="url-item"
      >
        {url.icon && <i class={`icon-${url.icon}`}></i>}
        <span>{url.label}</span>
      </a>
    ))}
  </div>
</div>
```

### Management Interface

```javascript
// Add URL Form
function AddCustomUrl() {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const response = await fetch('/api/users/me/custom-urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ label, url, icon })
    });
    
    const data = await response.json();
    // Handle success
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="text" 
        placeholder="Label (e.g., Behance)" 
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        required
      />
      <input 
        type="url" 
        placeholder="https://example.com" 
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <input 
        type="text" 
        placeholder="Icon (optional)" 
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
      />
      <button type="submit">Add URL</button>
    </form>
  );
}
```

### Drag-and-Drop Reordering

```javascript
// Using a library like react-beautiful-dnd
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

function CustomUrlsList({ urls, onReorder }) {
  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(urls);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    const orderedIds = items.map(item => item._id);
    
    await fetch('/api/users/me/custom-urls/reorder', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ orderedIds })
    });
    
    onReorder(items);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="urls">
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef}>
            {urls.map((url, index) => (
              <Draggable key={url._id} draggableId={url._id} index={index}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    {url.label}: {url.url}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
```

---

## Security Considerations

### URL Validation
- ✅ Must start with `http://` or `https://`
- ✅ No JavaScript URLs allowed
- ✅ No data URLs allowed
- ✅ Protected against XSS

### Input Sanitization
- ✅ Label trimmed and max length enforced
- ✅ URL trimmed and validated
- ✅ Icon trimmed and max length enforced

### Rate Limiting
- Consider adding rate limits for:
  - Maximum URLs per user (currently 20)
  - Maximum add operations per hour
  - Maximum update operations per hour

---

## Testing

### cURL Examples

```bash
# 1. Get all custom URLs
curl -X GET http://localhost:3000/api/users/me/custom-urls \
  -H "Authorization: Bearer $TOKEN"

# 2. Add a custom URL
curl -X POST http://localhost:3000/api/users/me/custom-urls \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Behance Portfolio",
    "url": "https://behance.net/username",
    "icon": "behance"
  }'

# 3. Update a custom URL
curl -X PUT http://localhost:3000/api/users/me/custom-urls/$URL_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Updated Label",
    "isVisible": true
  }'

# 4. Delete a custom URL
curl -X DELETE http://localhost:3000/api/users/me/custom-urls/$URL_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. Reorder URLs
curl -X PUT http://localhost:3000/api/users/me/custom-urls/reorder \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderedIds": ["url_id_3", "url_id_1", "url_id_2"]
  }'

# 6. Toggle visibility
curl -X PUT http://localhost:3000/api/users/me/custom-urls/visibility \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isVisible": false}'

# 7. View in portfolio
curl -X GET http://localhost:3000/api/portfolio/$USER_ID
```

---

## Summary

### What Was Added

✅ **Database Schema**
- `customUrls` array in User model
- `customUrls` visibility in `contactVisibility`

✅ **API Endpoints** (6 new endpoints)
- GET - Get all custom URLs
- POST - Add custom URL
- PUT - Update custom URL
- DELETE - Delete custom URL
- PUT - Reorder custom URLs
- PUT - Toggle visibility

✅ **Portfolio Integration**
- Custom URLs appear in public portfolios
- Respects visibility settings
- Sorted by order

✅ **Features**
- Unlimited URLs (with 20 max limit)
- Custom labels and icons
- Individual and global visibility control
- Drag-and-drop ordering support
- URL validation and security

---

## Status

**✅ Fully Implemented**  
**✅ Tested**  
**✅ Documented**  
**✅ Ready for Production**

The custom URLs feature is now live and ready to use! Users can add any kind of URL to their profile and showcase their entire online presence in their portfolio.
