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

### Phase 6: Email Integration (2026-03-15, In Progress)
- **Outlook Integration**: OAuth 2.0 authentication with Microsoft Graph API
- **Email View**: Inbox with read/unread status, sender, subject, preview
- **Email-to-Task**: Convert emails to tasks with one click
- **Sync Status**: Display connected email address and sync counts
- **LLM Usage Tracking**: Monitor API usage in 5-hour, weekly, monthly windows
- **AI Email Filtering**: Token-efficient heuristic + LLM fallback for important email detection
- **Mark All as Read**: Bulk mark emails as read with local state first, async provider sync
- **Performance Optimizations**: Event delegation, non-blocking async operations
- **Dashboard Redesign**: Two-column layout, professional minimalist style, scrollbars on all views

## Features

### Current Features
- **Multiple Views**: Dashboard, Board, Calendar, List, and Email modes
- **Project Management**: Create and organize tasks by project with color coding
- **Task Attributes**: Title, description, priority (Low/Medium/High), due date, status
- **Activity Log**: Track all task changes
- **Statistics**: Real-time counts for total, in progress, completed, and overdue tasks
- **Email Integration**: Outlook sync, email view, email-to-task conversion
- **LLM Integration**: AI email filtering, API usage tracking

### Tech Stack
- **Backend**: Node.js + Express
- **Data Storage**: JSON file-based
- **Frontend**: Vanilla JavaScript + CSS3

## Getting Started

### Prerequisites
- Node.js (v14 or higher)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open http://localhost:3000 in your browser

## Project Structure

```
To-Do_List/
├── server.js                 # Express server entry point
├── db.js                     # JSON data layer
├── config/
│   └── emailProviders.js     # Email provider configuration
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
│   ├── ReminderService.js    # Background reminder and sync service
│   └── EmailFilterService.js # AI email filtering
├── .env                      # Environment variables (API credentials)
├── board.json                # Data storage
└── public/
    ├── index.html            # Main UI
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
