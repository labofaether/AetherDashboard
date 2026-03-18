# Aether Dashboard

A personal productivity system with modular views and project organization.

## Development Timeline

### Phase 1: Focus Board (Initial)
- Simple three-column task board (To Do → In Progress → Done)
- Task priorities and due dates
- Local SQLite database

### Phase 2: Mission Control v1 (Completed)
- Dark tech-themed UI
- Dashboard with statistics
- Activity log tracking
- Four modular views:
  - Dashboard - overview and stats
  - Board - Kanban-style task board
  - Calendar - timeline view
  - List - table view with filtering/sorting

### Phase 3: Mission Control v2 (Current)
- Project classification with color coding
- Enhanced board design
- Modular architecture improvements
- JSON-based data storage

### Phase 4: Minimalist Redesign (In Progress)
- Claude/OpenAI inspired minimalist design
- Clean, professional aesthetic
- No emojis
- Neutral color palette with restrained accents

### Phase 5: Upcoming
- TBD

### Phase 6: Email Integration (2026-03-15, Completed)
- **Outlook Integration**: OAuth 2.0 authentication with Microsoft Graph API
- **Email View**: Inbox with read/unread status, sender, subject, preview
- **Email-to-Task**: Convert emails to tasks with one click
- **Sync Status**: Display connected email address and sync counts
- **LLM Usage Tracking**: Monitor API usage in 5-hour, weekly, monthly windows
- **AI Email Filtering**: Token-efficient heuristic + LLM fallback for important email detection
- **Mark All as Read**: Bulk mark emails as read with local state first, async provider sync
- **Performance Optimizations**: Event delegation, non-blocking async operations
- **Dashboard Redesign**: Two-column layout, professional minimalist style, scrollbars on all views

### Phase 7: Data Retention & Video Agent Integration (2026-03-16, Completed)
- **Data Retention Service**: Automated cleanup to prevent database bloat on consumer hardware
- **Email Retention**: Keep recent 500 emails or 30 days (whichever is fewer), converted-to-task emails kept for 90 days
- **Event Retention**: Keep all future events + past 14 days
- **Reminder Retention**: Keep triggered reminders for 7 days
- **Email Filter Retention**: Keep recent 100 filter results
- **Cleanup Scheduling**: Light cleanup hourly, full cleanup daily
- **Video Agent Link**: Quick access button to open Aether-video-agent in new tab (runs on port 3001)
- **Multi-Account Email Display**: Dashboard Important Email section shows both sender and recipient addresses for multi-email setups
- **Background Service Integration**: Data cleanup integrated with ReminderService for automatic execution

### Phase 8: Memory & Portability Improvements (2026-03-16, Current)
- **In-Memory Caching**: Database loaded once and cached in memory, reducing disk I/O
- **Write Queue & Debouncing**: Async write queue prevents race conditions, changes flushed periodically
- **Graceful Shutdown**: Ensures all data is saved to disk before exit
- **Configurable Port**: Server port can be set via PORT environment variable
- **Environment Template**: .env.example provided for easy setup
- **Improved Documentation**: Comprehensive setup guide for new users
- **Thread Safety**: Prevents concurrent write conflicts with write queue

## Features

### Current Features
- **Multiple Views**: Dashboard, Board, Calendar, List, and Email modes
- **Project Management**: Create and organize tasks by project with color coding
- **Task Attributes**: Title, description, priority (Low/Medium/High), due date, status
- **Activity Log**: Track all task changes
- **Statistics**: Real-time counts for total, in progress, completed, and overdue tasks
- **Email Integration**: Outlook sync, email view, email-to-task conversion, multi-account support
- **LLM Integration**: AI email filtering, API usage tracking
- **Data Retention**: Automated cleanup to prevent database bloat, configurable retention policies
- **Video Agent Integration**: Quick access button to launch Aether-video-agent (YouTube/Bilibili summarization tool)
- **Memory Optimized**: In-memory caching with periodic flushing for better performance
- **Portable**: Easy to install and run anywhere with Node.js

### Tech Stack
- **Backend**: Node.js + Express
- **Data Storage**: JSON file-based
- **Frontend**: Vanilla JavaScript + CSS3

## Getting Started

### Prerequisites
- Node.js (v14 or higher)

### Quick Start

1. **Clone or download the project**
   ```bash
   cd To-Do_List
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Copy the example configuration
   cp .env.example .env
   ```

   Edit the `.env` file and fill in your configuration (see [Configuration](#configuration) below).

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open the application**

   Navigate to `http://localhost:3000` in your browser.

### Configuration

The `.env` file contains all configurable settings:

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `AZURE_TENANT_ID` | Azure AD tenant ID for Outlook | For email |
| `AZURE_CLIENT_ID` | Azure AD client ID | For email |
| `AZURE_CLIENT_SECRET` | Azure AD client secret | For email |
| `AZURE_REDIRECT_URI` | OAuth redirect URI | For email |
| `DEFAULT_FROM_EMAIL` | Default sender email | For email |
| `REMINDER_CHECK_INTERVAL` | Reminder check interval in ms (default: 60000) | No |
| `EMAIL_SYNC_INTERVAL` | Email sync interval in ms (default: 300000) | No |
| `ANTHROPIC_BASE_URL` | LLM API base URL | For AI filtering |
| `ANTHROPIC_API_KEY` | LLM API key | For AI filtering |
| `ANTHROPIC_MODEL` | LLM model name | For AI filtering |

**Note**: Email and AI features are optional. The core task management works without any external configuration.

### Data Storage

All data is stored locally in `board.json`. The file is created automatically on first run.

- **Memory Optimization**: Data is cached in memory and flushed to disk periodically (default: 2 seconds)
- **Backup**: Consider backing up `board.json` regularly
- **Portability**: Simply copy the entire directory to move your data to another machine

## Project Structure

```
To-Do_List/
├── server.js                 # Express server entry point
├── db.js                     # JSON data layer
├── config/
│   ├── emailProviders.js     # Email provider configuration
│   └── dataRetention.js      # Data retention policy configuration
├── emailProviders/
│   ├── EmailProviderInterface.js  # Abstract provider interface
│   └── OutlookProvider.js    # Microsoft Graph API implementation
├── models/
│   ├── TaskModel.js          # Task CRUD operations
│   ├── ProjectModel.js       # Project CRUD operations
│   ├── EmailModel.js         # Email CRUD and sync operations
│   ├── ApiUsageModel.js      # API usage tracking
│   └── LlmUsageModel.js      # LLM usage tracking
├── routes/
│   ├── tasks.js              # Task API endpoints
│   ├── projects.js           # Project API endpoints
│   ├── activity.js           # Activity API endpoints
│   └── emails.js             # Email API endpoints
├── services/
│   ├── ReminderService.js    # Background reminder, sync, and cleanup service
│   ├── EmailFilterService.js # AI email filtering
│   └── DataCleanupService.js # Automated data cleanup and retention
├── .env                      # Environment variables (API credentials, not tracked)
├── .env.example              # Environment variable template
├── board.json                # Data storage (not tracked)
└── public/
    ├── index.html            # Main UI with Video Agent link
    ├── style.css             # Minimalist styling
    └── script.js             # Frontend logic
```

## API Endpoints

### Tasks
- `GET /tasks` - Fetch all tasks (optionally filtered by projectId)
- `POST /tasks` - Create a new task
- `PUT /tasks/status` - Update task status
- `PUT /tasks/description` - Update task description
- `DELETE /tasks` - Delete a task
- `POST /tasks/clear-completed` - Clear all completed tasks

### Projects
- `GET /projects` - Fetch all projects
- `POST /projects` - Create a new project
- `DELETE /projects` - Delete a project

### Activity
- `GET /activity` - Fetch recent activity
