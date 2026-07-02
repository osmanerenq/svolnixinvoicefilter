# Svolnix Invoice Filter & AI Analysis (Tauri v2 + React)

This desktop application parses PDF and Excel invoices at high speed, filters and groups them based on invoice details (issuer, recipient, tax number, amount, date), and automatically categorizes and organizes them using AI (DeepSeek API and Local Embedding Engine) support.

---

## Key Features

- **High-Performance Parsing:** The Rust-based parser engine reads and analyzes PDF and Excel invoices within milliseconds.
- **Local AI Memory (Semantic Memory):**
  - Uses a local vector database (embedding engine) to train the AI on how to categorize your invoices.
  - Manual category corrections are saved locally in the `trained_categories.json` file on your machine and are automatically used to classify future invoices.
- **Dual-Model AI Analysis (DeepSeek):**
  - **Model 1 (Quick Analysis / Filtering):** Optimized for fast filtering and basic AI queries.
  - **Model 2 (Detailed AI Correction):** Used for smart analysis and correcting poorly parsed or complex invoices.
- **Smart Folder Organization:**
  - Export invoices by sorting them into folders based on issuer, recipient, location, or category, including hierarchical subfolders.
- **Advanced Filtering & Search:**
  - Search and filter by issuer/recipient company name, date range, amount range, category, and free-text search inside invoice contents.

---

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Zustand (State Management), Tailwind CSS, Lucide Icons.
- **Backend (Desktop):** Tauri v2, Rust (Tokio & Parser libraries).
- **Artificial Intelligence:**
  - **Local Embedding Engine** (ONNX / Ort) for local word/phrase semantic similarity.
  - **DeepSeek API** integration for deep analytical queries.

---

## File Structure & Workflow

- `src-tauri/src/parser.rs`: Handles high-speed regex and pattern parsing of PDF and Excel invoice templates.
- `src-tauri/src/memory.rs`: Manages vector-based category learning. Employs `initial_trained_categories.json` as a default template and saves user-trained data in `trained_categories.json`.
- `src-tauri/src/lib.rs`: Coordinates Tauri command handlers and the core application state (AppState).

---

## Installation & Setup

### Prerequisites
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (for Tauri compilation)
- [Node.js](https://nodejs.org/) (for frontend packages)

### Steps

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run in Development Mode:**
   ```bash
   npm run tauri dev
   ```

3. **Build Production Binary:**
   ```bash
   npm run tauri build
   ```

---

## Tips & Usage

- **AI Settings:** Enter your DeepSeek API key in the settings panel (gear icon on the top right) to enable smart AI categorization and query features.
- **Sync Cache Categories to Training:** Click this button in the settings panel to commit your manual category changes into the AI's persistent local vector database.
