# BustaPaga - Product Requirements Document

## Overview
Cross-platform mobile application for personal payroll management built with Expo/React Native.

## Core Stack
- **Frontend**: Expo SDK 54, React Native, TypeScript, Expo Router
- **Backend**: FastAPI, Python
- **Database**: MongoDB
- **State Management**: Zustand

## Implemented Features ✅

### 1. Dashboard (index.tsx)
- Welcome header with user name
- Quick clock-in/out ("Timbratura Rapida")
- **Multiple marcature per day** (pausa pranzo, reperibilità)
- Button color logic: Entrata green → grey, Uscita grey → red after entry
- Compact marcature display (E: 08:00, U: 12:00, E: 14:00, U: 18:00)
- Monthly summary (ore lavorate, straordinari, giorni, ticket)
- Net salary estimate
- Ferie balance
- Comporto malattia tracker

### 2. Timbrature (timbrature.tsx)
- **Month/Year selector** (< Gen 2026 >) to navigate historical data
- **Tab-based view**: Mie (personali), Azienda, Confronto
- Weekly summary view
- List of all time entries with marcature
- Add/edit entries via BottomSheet
- DatePicker with calendar modal
- TimePicker with hour/minute selection
- **PDF Upload for company timesheets (SOMEtime format)**
- **Automatic parsing and import**
- **Comparison view with discrepancy highlighting (badge counter)**
- **Reperibilità toggle** in add/edit form

### 3. Assenze (assenze.tsx)
- Absence management (ferie/malattia)
- Calendar-based date selection

### 4. Buste Paga (buste-paga.tsx)
- Payslip list view
- Monthly breakdown
- **PDF Upload with automatic Zucchetti parsing**
- **Extraction of: netto, TFR, ore lavorate**

### 5. Altro Menu (altro.tsx)
- AI Chat Assistant (GPT integration ready)
- Alerts/notifications
- Statistics with zoom levels (Giorno/Settimana/Mese/Anno/Tutti)
- Reperibilità management
- Settings:
  - Theme color selection (8 colors)
  - PIN change
  - Contractual data editing with confirmation dialog

### 6. Backend API (/app/backend/server.py)
- All CRUD endpoints for timbrature, assenze, buste-paga
- **Multiple marcature per day support**
- Dashboard data aggregation
- Statistics endpoints
- Chat integration endpoint
- **SOMEtime PDF parser** (/app/backend/sometime_parser.py)
- **Zucchetti PDF parser** (/app/backend/zucchetti_parser.py)
- **Company timbrature endpoints with auto-import**
- **Comparison endpoints (personali vs aziendali)**

## Pending Features (Backlog)

### P1 - High Priority
- [ ] PDF parsing for "Zucchetti" payslips
- [ ] PDF parsing for "SOMEtime" timelogs (structure ready, parser pending)

### P2 - Medium Priority
- [ ] Authentication flow with PIN and Face ID/Touch ID
- [ ] Cloud backup/sync feature
- [ ] AI Chatbot full implementation with GPT

### P3 - Low Priority
- [ ] Push notifications
- [ ] Export functionality

## Technical Notes
- Web compatibility achieved by fixing Metro bundler zustand ESM issue
- Custom storage implementation for web (localStorage) vs native (AsyncStorage)
- babel-preset-expo required for proper transpilation

## Date: March 9, 2026
