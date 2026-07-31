# PRD — LORESCALE AI Presenter Enterprise Platform Requirements Document

## 1. Overview

### 1.1 Latar Belakang

LORESCALE saat ini telah memiliki platform presentasi digital berbasis web yang digunakan untuk penyampaian informasi, knowledge sharing, training, seminar, konferensi, dan berbagai kegiatan edukatif maupun korporasi.

Permasalahan utama yang ditemukan pada model presentasi tradisional adalah:

- Ketergantungan terhadap presenter manusia
- Kualitas penyampaian yang tidak konsisten
- Keterbatasan skala untuk event besar
- Keterbatasan waktu dan sumber daya presenter
- Sulitnya menjaga kualitas presentasi yang sama di berbagai lokasi
- Tidak tersedianya sesi tanya jawab yang selalu aktif
- Biaya operasional presenter yang tinggi

LORESCALE AI Presenter hadir sebagai Digital Presentation Intelligence Layer yang memungkinkan sebuah presentasi PowerPoint berubah menjadi presenter digital otonom yang mampu:

- Menyambut audiens
- Menjelaskan isi slide
- Mengendalikan perpindahan slide
- Menutup presentasi
- Menjawab pertanyaan audiens secara kontekstual

tanpa kehadiran presenter manusia.

---

### 1.2 Problem Statement

Organisasi membutuhkan sistem yang mampu:

1. Menjalankan presentasi secara otomatis.
2. Menjaga kualitas penyampaian yang konsisten.
3. Menjawab pertanyaan berdasarkan materi presentasi.
4. Mengurangi ketergantungan terhadap SDM presenter.
5. Mempercepat distribusi knowledge dalam skala besar.
6. Menghadirkan pengalaman presentasi modern berbasis AI.

---

### 1.3 Tujuan Bisnis

#### Primary Goals

- Mengubah presentasi statis menjadi pengalaman interaktif berbasis AI.
- Menjadi platform AI Presenter pertama yang enterprise-ready di SEA.
- Menambah product line LORESCALE.
- Meningkatkan recurring revenue melalui subscription model.
- Menjadi fondasi Digital Human Platform LORESCALE.

#### Secondary Goals

- Meningkatkan engagement peserta.
- Mengurangi biaya operasional event.
- Meningkatkan accessibility knowledge delivery.
- Menyediakan analytics berbasis AI.

---

### 1.4 Value Proposition

#### Untuk Event Organizer

- Tidak membutuhkan presenter manusia.
- Dapat menjalankan banyak event secara paralel.

#### Untuk Universitas

- Materi dapat disampaikan secara konsisten.
- Dosen dapat fokus pada aktivitas akademik lainnya.

#### Untuk Rumah Sakit

- Training medis dapat berjalan 24/7.
- Standardisasi materi pelatihan.

#### Untuk Enterprise

- Onboarding otomatis.
- Training internal lebih efisien.
- Knowledge transfer yang scalable.

---

### 1.5 Target Pengguna

#### Segment 1 — Enterprise

- Corporate
- Bank
- Insurance
- Manufacturing

#### Segment 2 — Education

- University
- School
- Training Center

#### Segment 3 — Healthcare

- Hospital
- Medical Conference
- Pharmaceutical Company

#### Segment 4 — Event Industry

- Event Organizer
- Exhibition Organizer
- Conference Organizer

---

### 1.6 Scope MVP

### In Scope

#### Presentation Processing

- Upload PPT
- Upload PDF
- Upload DOCX
- Upload TXT

#### AI Presentation

- Greeting Stage
- Presentation Stage
- Closing Stage
- Q&A Stage

#### AI Services

- Script Generation
- Voice Generation
- Knowledge Extraction
- RAG Search
- Q&A Answering

#### Realtime

- Live Presentation
- Live Session Monitoring
- Live Question Submission

#### Dashboard

- Presentation Management
- Session Management
- Analytics

---

### Out of Scope

#### V1

- AI Generated PPT
- Video Recording Export
- White Label
- Custom Domain
- Multi Avatar Marketplace
- AR/VR Presentation
- Offline AI Model
- AI Agent Collaboration
- Holographic Presenter

---

### 1.7 Success Metrics

#### Product KPI

| KPI | Target |
|-------|-------|
| Upload Success Rate | >99% |
| Parsing Success Rate | >98% |
| Session Completion Rate | >95% |
| Q&A Accuracy | >90% |
| Voice Generation Success | >99% |

#### Business KPI

| KPI | Target |
|-------|-------|
| Enterprise Adoption | >25% |
| Retention | >85% |
| Monthly Active Organizations | >500 |
| Annual Revenue Growth | >100% |

#### Technical KPI

| KPI | Target |
|-------|-------|
| API Availability | 99.95% |
| Dashboard Load | <2s |
| Q&A Response | <2s |
| Slide Transition | <500ms |

---

### 1.8 Asumsi Awal

#### Existing Infrastructure

LORESCALE telah memiliki:

- Production Environment
- Cloud Infrastructure
- Existing Backend Services
- Existing Avatar Rendering Infrastructure

#### Technology Assumptions

| Layer | Technology |
|---------|---------|
| Frontend | Next.js |
| Backend | NestJS |
| Database | PostgreSQL |
| Queue | Redis |
| Storage | MinIO |
| AI | OpenAI |
| STT | Whisper |
| TTS | Existing Provider |
| Avatar | Existing Production Avatar |
| Realtime | Socket.IO |

---

## 2. Requirements

# Functional Requirements

---

## FR-001 Presentation Creation

### Description

User dapat membuat presentation project baru.

### Inputs

- Title
- Description
- Language
- Category

### Outputs

- Presentation ID
- Draft Status

### Acceptance Criteria

- Presentation berhasil dibuat.
- Status awal = Draft.

---

## FR-002 File Upload

### Description

User dapat mengunggah:

- PPTX
- PPT
- PDF
- DOCX
- TXT

### Validation

#### PPT

Max Size:

```text
500MB
```

#### Supporting Documents

Max Files:

```text
100 files
```

### Acceptance Criteria

- File tersimpan di object storage.
- Metadata tersimpan di database.
- Processing job dibuat.

---

## FR-003 PPT Parsing

### Description

System mengekstrak:

- Text
- Images
- Charts
- Tables
- Notes

### Acceptance Criteria

- Semua slide berhasil diekstrak.
- Slide metadata tersimpan.

---

## FR-004 Script Generation

### Description

System membuat narasi otomatis untuk setiap slide.

### Inputs

- Slide Content
- Speaker Notes
- Language

### Outputs

- Narration Script

### Acceptance Criteria

- Script tersedia per slide.
- Script dapat diregenerate.

---

## FR-005 Voice Generation

### Description

System membuat audio untuk setiap slide.

### Outputs

- Audio Asset

### Acceptance Criteria

- Audio playable.
- Audio tersimpan di storage.

---

## FR-006 Knowledge Base Creation

### Description

System membuat embedding dari:

- PPT
- PDF
- DOCX
- TXT

### Acceptance Criteria

- Vector tersedia.
- Retrieval dapat dilakukan.

---

## FR-007 AI Presentation Execution

### Description

AI menjalankan presentasi otomatis.

### Stages

1. Greeting
2. Presentation
3. Closing
4. Q&A

### Acceptance Criteria

- Slide berpindah otomatis.
- Narasi sinkron dengan slide.
- Avatar tampil sesuai stage.

---

## FR-008 Operator Control

### Actions

- Start
- Pause
- Resume
- Next Slide
- Previous Slide
- End Session

### Acceptance Criteria

- Kontrol realtime.
- Tidak menyebabkan session crash.

---

## FR-009 Audience Question Submission

### Input Modes

MVP:

- Microphone

### Acceptance Criteria

- Pertanyaan diterima.
- Pertanyaan diproses.

---

## FR-010 AI Q&A

### Sources

Priority Order:

1. PPT
2. Notes
3. PDF
4. DOCX
5. TXT
6. Organizational Knowledge Base

### Acceptance Criteria

- Jawaban memiliki source attribution.
- Hallucination diminimalkan.

---

## FR-011 Moderation Layer

### Features

- Profanity Detection
- Toxic Detection
- Prompt Injection Detection
- Unsafe Content Detection

### Acceptance Criteria

- Pertanyaan berbahaya diblok.
- Log moderation tersimpan.

---

## FR-012 Analytics

### Metrics

- Audience Count
- Questions
- Session Duration
- Completion Rate

### Acceptance Criteria

- Data realtime tersedia.
- Export tersedia.

---

# Non Functional Requirements

## Performance

| Metric | Target |
|----------|----------|
| API | <300ms |
| Q&A | <2s |
| Dashboard | <2s |
| Upload Start | <1s |

---

## Scalability

Target:

```text
100 Concurrent Presentations
```

---

## Reliability

Target SLA:

```text
99.95%
```

---

## Availability

Target:

```text
24/7 Operation
```

---

## Security

Requirements:

- JWT Authentication
- RBAC
- Encryption at Rest
- Encryption in Transit
- Audit Logs

---

## Maintainability

Requirements:

- Modular Architecture
- Domain Driven Modules
- Independent Services
- Type Safety

---

## Accessibility

Target:

```text
WCAG 2.1 AA
```

---

## Compatibility

Supported:

- Chrome
- Edge
- Safari
- Firefox

---

## 3. Core Features

# Feature 1 — AI Presentation Engine

Priority:

```text
MUST
```

### Tujuan

Menjalankan presentasi secara otomatis.

### Deskripsi

Engine yang mengontrol seluruh lifecycle presentasi.

### Acceptance Criteria

- Greeting berjalan.
- Presentation berjalan.
- Closing berjalan.
- Q&A berjalan.

### Edge Cases

- Slide kosong.
- Audio gagal.
- Avatar gagal render.

### Technical Notes

State Machine:

```text
DRAFT
 ↓
READY
 ↓
GREETING
 ↓
PRESENTING
 ↓
CLOSING
 ↓
QNA
 ↓
COMPLETED
```

---