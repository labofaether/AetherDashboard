# Mission Control Panel

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

## Features

### Current Features
- **Multiple Views**: Dashboard, Board, Calendar, and List modes
- **Project Management**: Create and organize tasks by project with color coding
- **Task Attributes**: Title, description, priority (Low/Medium/High), due date, status
- **Activity Log**: Track all task changes
- **Statistics**: Real-time counts for total, in progress, completed, and overdue tasks

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
├── server.js              # Express server entry point
├── db.js                  # JSON data layer
├── models/
│   ├── TaskModel.js       # Task CRUD operations
│   └── ProjectModel.js    # Project CRUD operations
├── routes/
│   ├── tasks.js           # Task API endpoints
│   ├── projects.js        # Project API endpoints
│   └── activity.js        # Activity API endpoints
└── public/
    ├── index.html         # Main UI
    ├── style.css          # Minimalist styling
    └── script.js          # Frontend logic
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
