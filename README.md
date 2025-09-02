# EduSync: AI-Powered Educational Platform

EduSync is an all-in-one, AI-powered educational platform designed to transform the teaching and learning experience. Built using Next.js and React, EduSync provides a comprehensive suite of features for administrators, teachers, and students. Its core strength lies in its seamless integration of artificial intelligence, which empowers dynamic content generation, real-time tutoring, adaptive assessments, and personalized learning experiences.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### AI-Powered Content Generation

- **Dynamic Lesson Creation:** Automatically generate lesson summaries, detailed explanations, worksheets, and quizzes tailored to specific subjects and grade levels.
- **Adaptive Feedback:** Receive instant, AI-generated feedback on student code submissions and assessment answers.
- **Personalized Learning:** Use intelligent insights to adapt and recommend content based on each student's progress and performance.

### Interactive Learning Tools

- **Real-time AI Tutor Chat:** Engage in interactive sessions with an AI tutor for on-demand support and clarification for complex topics.
- **Intelligent Code Editor:** Leverage the Monaco Editor integration for an interactive development environment enhanced with AI-driven debugging and suggestions.
- **Progress Tracking:** Monitor learning progress through detailed dashboards that display performance metrics, practice exercises, and assessment analytics.

### Administrative and Management Tools

- **Admin Dashboard:** Access comprehensive statistics, including total assessments, average scores, user activity, and AI-powered insights for strategic decision-making.
- **Timetable Management:** Easily create, update, and manage class schedules, along with real-time collaborative editing features.
- **User Management:** Benefit from a role-based access system ensuring that administrators, teachers, and students have tailored experiences.

### Integration & Collaboration

- **Real-Time Collaboration:** Collaborate via live chat, whiteboard sessions, and real-time updates facilitated by Socket.io.
- **Third-Party Content Integration:** Use the Tavily API to fetch and convert external content into Markdown, enriching lesson material with diverse resources.
- **Data Visualization:** Utilize Recharts for clear and interactive visual representation of performance metrics and course analytics.

---

## Technology Stack

- **Framework:** Next.js (Server-side and Client-side rendering)
- **Frontend:** React, Tailwind CSS (with dark mode and utility-first design)
- **Backend:** Node.js, Supabase (Postgres)
- **AI Services:** OpenAI integration for real-time content generation and tutoring
- **Editor:** Monaco Editor for interactive coding and development exercises
- **Visualization:** Recharts for dynamic charts and performance reports
- **Real-Time Collaboration:** Socket.io for live interactions and updates
- **UI Components:** shadcn/ui components (Cards, Tables, Tabs, etc.)
- **Icons:** lucide-react

---

## Project Structure

```
EduSync
├── src/
│ ├── app/ # Next.js pages and dynamic routes
│ │ ├── admin/ # Admin dashboards and management pages
│ │ ├── teachers/ # Teacher pages for lesson creation, content generation, and resource management
│ │ ├── students/ # Student interfaces including lessons, practice modules, and AI chat tutor
│ │ └── ... # Additional routes for content and assessments
│ ├── components/ # Reusable UI components (CodeEditor, Cards, Tables, etc.)
│ ├── lib/ # API actions, utilities, and third-party integration scripts (e.g., Tavily API)
│ ├── models/ # Mongoose models (e.g., Progress)
│ └── app/globals.css # Global Tailwind CSS styles
├── public/ # Static assets and uploads
├── package.json # Project dependencies and scripts
├── tailwind.config.ts # Tailwind configuration
└── README.md # Project documentation (this file)
```

---

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/your-username/edusync.git
   cd edusync
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure Environment Variables:**

   Create a `.env.local` file in the root of the project and add the following variables:

   ```env
   NEXT_PUBLIC_API_URL=<your-api-url>
   OPENAI_API_KEY=<your-openai-api-key>
   TAVILY_API_KEY=<your-tavily-api-key>
   NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
   NEXTAUTH_SECRET=<your-nextauth-secret>
   ```

### Supabase Schema (example)

Run these in Supabase SQL editor (adjust types as needed):

```sql
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password text not null,
  name text not null,
  role text not null check (role in ('student','teacher','admin')),
  image text,
  isActive boolean default true,
  lastLogin timestamptz,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists students (
  user_id uuid primary key references users(id) on delete cascade,
  grade text,
  enrollment_date timestamptz default now(),
  guardian_name text,
  guardian_contact text,
  "createdAt" timestamptz default now()
);

create view if not exists students_view as
select
  u.id,
  u.email,
  u.name,
  u."isActive",
  u."lastLogin",
  s.user_id as "studentId",
  s.grade,
  s.enrollment_date as "enrollmentDate",
  s.guardian_name as "guardianName",
  s.guardian_contact as "guardianContact",
  u."createdAt",
  u."updatedAt"
from students s
join users u on u.id = s.user_id;

create table if not exists teachers (
  user_id uuid primary key references users(id) on delete cascade,
  subjects jsonb,
  grades jsonb,
  qualifications jsonb,
  specializations jsonb,
  "createdAt" timestamptz default now()
);

create view if not exists teachers_view as
select
  u.id,
  u.email,
  u.name,
  u."isActive",
  u."lastLogin",
  t.subjects,
  t.grades,
  t.qualifications,
  t.specializations,
  u."createdAt",
  u."updatedAt"
from teachers t
join users u on u.id = t.user_id;
```

4. **Run the Development Server:**

   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Access the Application:**

   Open [http://localhost:3000](http://localhost:3000) in your browser to view the platform.

---

## Usage

- **Admin Portal:**

  - Navigate to `/admin/dashboard` to manage assessments, view AI-powered analytics, monitor user statistics, and configure timetables.

- **Teacher Portal:**

  - Access `/teachers/dashboard` for lesson management and content creation.
  - Use the AI content generation features (e.g., in `/teachers/content`) to dynamically generate summaries, explanations, and quizzes.

- **Student Portal:**
  - Visit `/students/lessons` to access interactive lessons.
  - Engage with the AI tutor on the `/students/tutor` page for real-time assistance.
  - Monitor individual progress through detailed dashboards and practice modules.

---

## Development

### Interactive Features and Components

- **Code Editor:**

  - The `src/components/lessons/CodeEditor.tsx` component integrates the Monaco Editor to provide an interactive coding environment. It supports dynamic compilation and test execution with options for AI-enhanced debugging recommendations.

- **Content Generation:**

  - The platform uses AI services via the OpenAI package. Content generation endpoints (e.g., `/api/content/generate`) enable teachers to create lesson materials on the fly.

- **Real-time Collaboration:**
  - Utilize Socket.io features for live interactions and collaborative editing in timetable management and group exercises.

### Linting & Testing

- **Linting:**

  ```bash
  npm run lint
  ```

- **Testing:**

  _(Include your testing commands here if applicable)_

  ```bash
  npm run test
  ```

---

## Deployment

### Standard Deployment

1. **Build the Application:**

   ```bash
   npm run build
   ```

2. **Start the Application:**

   ```bash
   npm run start
   ```

### Docker Deployment

Use the provided `Dockerfile` to containerize the application:

# Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json .
COPY package-lock.json .

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
```

---

## Contributing

Contributions are welcome! Follow these steps to get started:

1. **Fork the Repository**
2. **Create a New Branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit Your Changes** with detailed commit messages.
4. **Push Your Branch**:
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** for review.

For major changes, please open an issue first to discuss your ideas.

---

## License

EduSync is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

---

EduSync leverages the power of AI to reinvent educational experiences, making learning more dynamic, interactive, and personalized. Whether you're an educator looking to streamline content creation or a student seeking real-time assistance, EduSync offers the tools you need to succeed in the modern educational landscape.
