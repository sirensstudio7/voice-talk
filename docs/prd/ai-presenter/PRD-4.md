## 9. Frontend Feature Specification

### Objective

AI Presenter harus mengikuti seluruh design system, component library, layout pattern, routing pattern, state management pattern, dan coding convention yang sudah digunakan pada aplikasi LORESCALE saat ini.

Tidak diperbolehkan membuat design language baru.

Semua UI baru harus menggunakan komponen existing terlebih dahulu sebelum membuat komponen baru.

---

## 9.1 Frontend Constraints

### Existing System First

Priority Order:

1. Existing Layout
2. Existing Components
3. Existing Hooks
4. Existing Store
5. Existing Utility
6. New Component

Rule:

```text
Reuse Before Create
```

---

## 9.2 New Routes

### Presentation Module

```text
/presentations

/presentations/[id]

/presentations/[id]/processing

/presentations/[id]/preview

/presentations/[id]/launch
```

---

### Session Module

```text
/sessions

/sessions/[id]

/sessions/[id]/live
```

---

## 9.3 Presentation List Screen

Purpose:

Menampilkan seluruh AI Presentation.

Columns:

- Name
- Status
- Slides
- Duration
- Updated At

Actions:

- Open
- Launch
- Archive
- Delete

---

## 9.4 Presentation Detail Screen

Sections:

### Overview

Display:

- Status
- Total Slides
- Duration
- Language

---

### Processing Status

Display:

```text
Upload Complete
Parsing Complete
Script Complete
Audio Complete
Embedding Complete
```

---

### Files

Display:

- PPT
- PDF
- DOCX
- TXT

---

### Actions

Buttons:

- Launch Session
- Regenerate Script
- Regenerate Audio

---

## 9.5 Processing Screen

Purpose:

Realtime progress monitoring.

Steps:

```text
Uploading

Parsing Slides

Generating Scripts

Generating Audio

Building Knowledge

Completed
```

Updates:

```text
Socket.IO
```

---

## 9.6 Slide Preview Screen

Purpose:

Memvalidasi hasil parsing.

Display:

### Left

Slide Preview

### Right

Generated Script

Controls:

- Previous
- Next

---

## 9.7 Session Launch Screen

Fields:

- Session Name
- Language
- Auto Start
- Enable Q&A

Action:

```text
Launch Presentation
```

---

## 9.8 Live Presentation Screen

Purpose:

Operator monitoring.

Layout mengikuti existing presentation viewer.

Additional Features:

### Session Status

Display:

```text
Greeting
Presenting
Closing
Q&A
Completed
```

---

### Current Slide

Display:

```text
Slide Number
Slide Title
Time Remaining
```

---

### Operator Controls

Actions:

- Pause
- Resume
- Next Slide
- Previous Slide
- End Session

---

## 9.9 Q&A Monitor Panel

Purpose:

Monitoring pertanyaan audiens.

Lists:

### Incoming

Questions waiting for processing.

### Answered

Answered by AI.

### Blocked

Rejected by moderation.

Display:

- Question
- Timestamp
- Source
- Status

---

## 9.10 Analytics Screen

Display:

- Session Duration
- Question Count
- Audience Count
- Completion Rate

---

## 9.11 Realtime Events

Frontend wajib subscribe ke:

```text
session.started

session.paused

session.resumed

slide.changed

question.received

answer.generated

session.completed
```

---

## 9.12 Frontend State

Reuse existing architecture.

Additional Stores:

presentationStore

sessionStore

questionStore

processingStore

---

## 9.13 Error Handling

### Upload Failed

Display:

```text
Upload failed.
Please retry.
```

---

### Processing Failed

Display:

```text
Presentation processing failed.
```

Actions:

Retry Processing

---

### Session Lost

Display:

```text
Connection lost.
Attempting reconnect.
```

---

## 9.14 Frontend Acceptance Criteria

### Presentation Module

- User dapat upload PPT
- User dapat melihat progress
- User dapat preview hasil parsing

### Session Module

- User dapat launch session
- User dapat memonitor AI Presenter
- User dapat mengontrol session

### Q&A Module

- Pertanyaan realtime muncul
- Jawaban realtime muncul
- Moderation status terlihat

### Analytics Module

- Data session tersedia
- Export tersedia

## 10. AI Presenter Screen Layout & Interaction Specification

### Overview

Dokumen ini mendefinisikan perilaku visual AI Presenter pada setiap stage presentasi.

Tujuan:

- Menstandarkan posisi avatar.
- Menstandarkan area slide.
- Menstandarkan transisi antar stage.
- Menjadi kontrak implementasi Frontend dan Avatar Engine.
- Mencegah interpretasi berbeda antar engineer.

---

# Stage 1 — Session Initializing

Status:

```text
INITIALIZING
```

Tujuan:

Menampilkan status persiapan sebelum presentasi dimulai.

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|            Preparing Presentation...           |
|                                                |
|                                                |
+------------------------------------------------+
```

Display:

- Session Name
- Loading Indicator
- Presentation Title

Actions Disabled:

- Next Slide
- Previous Slide
- End Session

Actions Enabled:

- Cancel Session

Exit Condition:

```text
All Assets Loaded
```

Next State:

```text
GREETING
```

---

# Stage 2 — Greeting

Status:

```text
GREETING
```

Tujuan:

Avatar menyambut audiens sebelum materi dimulai.

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|                    AVATAR                      |
|                                                |
|                                                |
+------------------------------------------------+
```

Avatar Position:

```text
Horizontal Center
Vertical Center
```

Avatar Size:

```text
40%-60% viewport height
```

Slide Visibility:

```text
Hidden
```

Animation:

```text
Fade In
Scale In
```

Speech:

```text
Greeting Script
```

Controls:

- Pause
- End Session

Disabled:

- Next Slide
- Previous Slide

Exit Condition:

```text
Greeting Audio Finished
```

Next State:

```text
TRANSITION_TO_PRESENTATION
```

---

# Stage 3 — Transition To Presentation

Status:

```text
TRANSITIONING
```

Tujuan:

Memindahkan avatar dari center ke area presentasi.

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|                  Slide Area                    |
|                                                |
|                                    Avatar      |
+------------------------------------------------+
```

Animation:

```text
Move Center → Bottom Right
```

Duration:

```text
500ms
```

Slide Visibility:

```text
Visible
```

Next State:

```text
PRESENTING
```

---

# Stage 4 — Presenting Slide

Status:

```text
PRESENTING
```

Tujuan:

Menjelaskan slide secara otomatis.

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|                  Slide Area                    |
|                                                |
|                                    Avatar      |
+------------------------------------------------+
```

Screen Allocation:

| Area | Percentage |
|--------|--------|
| Slide Area | 85% |
| Avatar Area | 15% |

Avatar Position:

```text
Bottom Right
```

Avatar Margin:

```text
32px
```

Displayed Elements:

### Slide

- Title
- Content
- Image
- Table
- Chart

### Avatar

- Talking Animation
- Lip Sync

### Session Info

Optional:

```text
Slide 4 of 20
```

Controls:

- Pause
- Resume
- Next Slide
- Previous Slide
- End Session

Exit Condition:

```text
Current Slide Audio Completed
```

Action:

```text
Auto Next Slide
```

---

# Stage 5 — Slide Transition

Status:

```text
SLIDE_TRANSITION
```

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|                  Slide Area                    |
|                                                |
|                                    Avatar      |
+------------------------------------------------+
```

Behavior:

```text
Stop Current Audio
Load Next Slide
Load Next Audio
Update Slide Counter
```

Duration:

```text
300-500ms
```

Next State:

```text
PRESENTING
```

---

# Stage 6 — Operator Pause

Status:

```text
PAUSED
```

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|                  Slide Area                    |
|                                                |
|                                    Avatar      |
|                                                |
|                SESSION PAUSED                  |
+------------------------------------------------+
```

Behavior:

```text
Audio Stop
Animation Stop
Timer Stop
```

Avatar State:

```text
Idle
```

Controls:

- Resume
- End Session

---

# Stage 7 — Closing

Status:

```text
CLOSING
```

Tujuan:

Menutup presentasi.

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|                    AVATAR                      |
|                                                |
|                                                |
+------------------------------------------------+
```

Animation:

```text
Move Bottom Right → Center
```

Slide Visibility:

```text
Last Slide Freeze
```

Speech:

```text
Closing Script
```

Controls:

- Pause
- End Session

Exit Condition:

```text
Closing Audio Finished
```

Next State:

```text
QNA
```

---

# Stage 8 — Q&A Waiting

Status:

```text
QNA_WAITING
```

Tujuan:

Menunggu pertanyaan audiens.

Layout:

```text
+------------------------------------------------+
| Waiting For Questions...                       |
|                                                |
|                                                |
|                                                |
|                                    Avatar      |
+------------------------------------------------+
```

Avatar Position:

```text
Bottom Right
```

Avatar State:

```text
Idle
```

Controls:

- End Session

---

# Stage 9 — Question Received

Status:

```text
QUESTION_RECEIVED
```

Layout:

```text
+------------------------------------------------+
| Question                                        |
|------------------------------------------------|
| What are the benefits of this solution?        |
|                                                |
|                                    Avatar      |
+------------------------------------------------+
```

Behavior:

```text
Show Question
Lock New Questions
Send To AI
```

Avatar State:

```text
Listening
```

Next State:

```text
THINKING
```

---

# Stage 10 — AI Thinking

Status:

```text
THINKING
```

Layout:

```text
+------------------------------------------------+
| Question                                        |
|------------------------------------------------|
| What are the benefits of this solution?        |
|                                                |
|                                    Avatar      |
+------------------------------------------------+
```

Avatar State:

```text
Thinking
```

Animation:

```text
Thinking Loop
```

Behavior:

```text
Retrieve Context
Generate Answer
Generate Voice
```

---

# Stage 11 — AI Answering

Status:

```text
ANSWERING
```

Layout:

```text
+------------------------------------------------+
| Question                                        |
|------------------------------------------------|
| What are the benefits of this solution?        |
|                                                |
| Answer                                           |
|------------------------------------------------|
| The benefits include...                        |
|                                    Avatar      |
+------------------------------------------------+
```

Avatar State:

```text
Talking
```

Behavior:

```text
Play Audio
Lip Sync
Display Transcript
```

Exit Condition:

```text
Answer Audio Finished
```

Next State:

```text
QNA_WAITING
```

---

# Stage 12 — Session Completed

Status:

```text
COMPLETED
```

Layout:

```text
+------------------------------------------------+
|                                                |
|                                                |
|         Presentation Successfully Ended        |
|                                                |
|                                                |
+------------------------------------------------+
```

Display:

- Total Slides
- Total Questions
- Session Duration

Actions:

- View Analytics
- Export Report
- Close Session

---

## Avatar State Machine

```text
IDLE
 ↓
GREETING
 ↓
TALKING
 ↓
IDLE
 ↓
THINKING
 ↓
ANSWERING
 ↓
IDLE
 ↓
CLOSING
```

---

## Frontend Rendering Rules

Avatar Layer:

```text
z-index: 100
```

Question Layer:

```text
z-index: 200
```

Modal Layer:

```text
z-index: 1000
```

---

## Responsive Rules

Desktop:

```text
Avatar 15%
Slide 85%
```

Large LED:

```text
Avatar 12%
Slide 88%
```

Projector:

```text
Avatar 20%
Slide 80%
```

Minimum Avatar Width:

```text
240px
```

Maximum Avatar Width:

```text
420px
```