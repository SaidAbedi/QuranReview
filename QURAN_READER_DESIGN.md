# QuranReview Quran Reader - Navigation Redesign

## Current State (Problems)

- ❌ Only shows pages 1-20 (hardcoded)
- ❌ No search functionality
- ❌ No chapter/juz toggle
- ❌ No "recently read" feature
- ❌ No progress tracking
- ❌ Limited to assignments only

## Proposed New Design

### 1. TOP NAVIGATION BAR
```
┌─────────────────────────────────┐
│ 🔍 Search (e.g. Al-Fatiha, 1:4) │ ← Quickly jump to chapter/page
│                             [⚙️]  │ ← Settings
└─────────────────────────────────┘
```

### 2. RECENTLY READ (Horizontal Scroll)
```
┌────────────────────────────────────────────┐
│ Recently Read                              │
│  [Page 1]  [Page 5]  [Page 12]  [Page 8]   │
│  Al-Fatiha Al-Baqara Al-Baqara Al-Anfal    │
└────────────────────────────────────────────┘
```

### 3. FILTER/SORT CONTROLS
```
┌────────────────────────────────────────────┐
│ [Chapter (114)] [Juz (30)]                 │ ← Toggle view
│ Sort: [Name ▼]  Progress: [Show All ▼]    │ ← Filter options
└────────────────────────────────────────────┘
```

### 4. MAIN LIST - CHAPTER VIEW
```
┌────────────────────────────────────────────┐
│ 1  الفاتحة          (1:1 - 1:7)            │ 
│   Al-Fatiha        ✓ Complete              │ ← Completion badge
├────────────────────────────────────────────┤
│ 2  البقرة          (2:1 - 2:286)          │
│   Al-Baqarah       🟡 In Progress 45%     │ ← Progress bar
├────────────────────────────────────────────┤
│ 3  آل عمران        (3:1 - 3:200)          │
│   Aal Imran        ⚪ Not Started          │
└────────────────────────────────────────────┘
```

### 5. MAIN LIST - JUZ VIEW
```
┌────────────────────────────────────────────┐
│ Juz 1  (Al-Fatiha, Al-Baqarah 1:1-2:141)  │
│ Pages: 1-22        ✓ Complete              │
├────────────────────────────────────────────┤
│ Juz 2  (Al-Baqarah 2:141-2:252)           │
│ Pages: 23-50       🟡 65% Complete        │
├────────────────────────────────────────────┤
│ Juz 3  (Al-Baqarah 2:252-3:92)            │
│ Pages: 51-80       ⚪ Not Started          │
└────────────────────────────────────────────┘
```

## Information Architecture

### Search Functionality
User can search by:
- Chapter name (English or Arabic)
- Chapter number (1, 2, 3...)
- Ayah reference (1:5, 2:255, etc.)
- Page number (1, 100, 604)
- Keyword search (optional, future)

Result: Jump directly to that page

### View Modes
1. **Chapter View** (114 chapters)
   - Shows: Chapter #, Arabic name, English name, Ayah range, Progress
   - Sort: By number (default), By name, By progress

2. **Juz View** (30 parts)
   - Shows: Juz #, Page range, Chapter distribution, Progress
   - Sort: By number (default), By progress

### Progress Indicators
- **✓ Complete** — Student completed this chapter/juz (green)
- **🟡 In Progress** — Partially completed with % (yellow/gold)
- **⚪ Not Started** — No submissions yet (gray)
- **🔴 Needs Practice** — Teacher requested resubmission (red)

### Bookmarks/Favorites
- User can bookmark any chapter/page
- Shows in "Recently Read" section
- Quick access from top bar

## Technical Implementation

### Data Requirements
- Full Quran structure (114 chapters, 30 juz, metadata)
- Student progress per chapter (completion status, %)
- Recent reading history (last 5-10 pages)
- Bookmarks (if implementing)

### Components to Create
1. `QuranBrowser/SearchBar.tsx` — Search input with suggestions
2. `QuranBrowser/RecentlyRead.tsx` — Horizontal scroll of last pages
3. `QuranBrowser/ViewModeToggle.tsx` — Chapter vs Juz toggle
4. `QuranBrowser/SortFilter.tsx` — Sort and filter controls
5. `QuranBrowser/ChapterList.tsx` — Full 114-chapter list with progress
6. `QuranBrowser/JuzList.tsx` — 30-juz list with progress
7. `Progress/ProgressIndicator.tsx` — Visual status badge

### API Requirements (if not existing)
- `GET /api/quran/chapters` — All 114 chapters with metadata
- `GET /api/quran/juz/:juzNumber` — Chapters in a specific juz
- `GET /api/progress/by-chapter` — Student's chapter completion status
- `GET /api/progress/by-juz` — Student's juz completion status
- `POST /api/bookmarks` — Save/manage bookmarks (optional)

## Phase 1: MVP (Core Navigation)
- [ ] Search bar (jumps to page/chapter)
- [ ] Chapter list (all 114 with progress dots)
- [ ] Recently read history
- [ ] Basic sort options

## Phase 2: Enhanced (Progress Tracking)
- [ ] Progress bars/percentages
- [ ] Juz view mode
- [ ] Filter by completion status
- [ ] Bookmarks

## Design Questions for You

1. **Layout preference?**
   - A) List view (like current + improvements)
   - B) Grid view (chapters as cards)
   - C) Hybrid (list with large items)

2. **Progress calculation?**
   - A) Per chapter (% completed)
   - B) Per page (pages completed in chapter)
   - C) Both

3. **Search UX?**
   - A) Search bar always visible at top
   - B) Search bar appears on tap
   - C) Slide-up modal with search

4. **Recently read count?**
   - A) Last 5 pages
   - B) Last 10 pages
   - C) Last 3 pages

5. **Bookmarks?**
   - A) Yes, implement in Phase 1
   - B) Yes, implement in Phase 2
   - C) Skip for now

## Wireframe Layout

```
┌─────────────────────────────────────┐
│  [🔍 Search]        [⚙️] [❤️] [☰]   │ ← Quick actions
├─────────────────────────────────────┤
│ Recently Read: [P1] [P5] [P12]      │
├─────────────────────────────────────┤
│ [Chapter] [Juz]   Sort: By Name     │ ← Controls
├─────────────────────────────────────┤
│                                     │
│ 1  الفاتحة      [===] 100% ✓        │ ← Chapter item
│    Al-Fatiha                        │
│                                     │
│ 2  البقرة        [=====>  ] 65%     │ ← With progress
│    Al-Baqarah                       │
│                                     │
│ 3  آل عمران      [       ] 0%       │ ← Not started
│    Aal Imran                        │
│                                     │
│    ... (scroll)                     │
│                                     │
└─────────────────────────────────────┘
```

## Next Steps

1. Get your feedback on the design questions above
2. Create the API endpoints if needed
3. Build the new Quran reader interface
4. Migrate existing navigation to new system
5. Test with real users
