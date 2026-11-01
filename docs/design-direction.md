# Sofia Cortex — Minimalist Design Direction

**Aesthetic North Star:** Things 3 (calm structure, tactile checkboxes, invisible chrome) + Apple Notes (immediate writing canvas, native accessory bar) + Bear (warm paper, typographic hierarchy, quiet markdown).  
**Core Rule:** Whitespace and typography do the framing. Remove every decorative border, uppercase meta label, invented metaphor, and spring animation.

---

## 1. Typography, Spacing, Hairlines, Radii & Cards

### 1.1 Type Scale (`src/theme/tokens.ts`)
- **UI Font:** `Inter` (`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`). `Inter_700Bold` is retired.
- **Reading View Font:** `Newsreader` (`Newsreader_400Regular`, `Newsreader_400Regular_Italic`, `Newsreader_500Medium`) — used **exclusively** inside the "Dış Göz" screen. Never mix serif into Home, Editor, Settings, or Autopilot.
- **Casing Rule:** Sentence case everywhere. `type.micro` (11pt uppercase, `+0.6pt` tracking) and the `upper()` helper are **deprecated and removed**.

| Token | Font Family (Weight) | Size | Line Height | Letter Spacing | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display` | `Inter_600SemiBold` (600) | `26pt` | `32pt` | `-0.60pt` | Note editor title, Autopilot task title |
| `title` | `Inter_600SemiBold` (600) | `20pt` | `26pt` | `-0.40pt` | Home top bar greeting, modal/sheet titles |
| `section` | `Inter_600SemiBold` (600) | `13pt` | `18pt` | `-0.10pt` | Section headers (`"Sabitlenenler"`, `"Bağlantılar"`), colored `c.textDim` |
| `body` | `Inter_400Regular` (400) | `16pt` | `24pt` | `-0.15pt` | Note editor body prose |
| `row` | `Inter_400Regular` (400) | `16pt` | `22pt` | `-0.20pt` | List row titles, checklist lines (`Inter_500Medium` for root rows with children) |
| `small` | `Inter_400Regular` (400) | `13pt` | `18pt` | `-0.05pt` | 1-line row preview, pills, toast, keyboard bar (`Inter_500Medium` on buttons) |
| `mono` | `Inter_500Medium` (500) | `12pt` | `16pt` | `0.00pt` | Autopilot step counter (`tabular-nums`) |
| `serifTitle` | `Newsreader_500Medium` (500) | `28pt` | `34pt` | `-0.40pt` | "Dış Göz" book page title only |
| `serifBody` | `Newsreader_400Regular` (400) | `19pt` | `30pt` | `-0.05pt` | "Dış Göz" book page body prose only (`16pt` paragraph spacing) |
| `serifPrompt` | `Newsreader_400Regular_Italic` | `17pt` | `25pt` | `0.00pt` | "Dış Göz" reflection question prompt only |

### 1.2 Spacing Scale (4pt Grid)
Keep `space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, xxxl: 40 }`.
- **Standard horizontal screen margin:** `20pt` (`space.xl`) on Home and Note Editor; `28pt` (`space.xxl`) on "Dış Göz" book page and Autopilot stage.
- **Vertical section rhythm:** `20pt` between major blocks; `0pt` between list rows.

### 1.3 Hairline Usage
Use `StyleSheet.hairlineWidth` (`0.33pt` on 3× displays) in `c.hairline` **only** in five places:
1. Sticky top bar bottom border (fades in only when `scrollY > 4pt`).
2. Home list row bottom separators, **inset to `left: 50pt`, `right: 20pt`** (aligned with text start, never full-bleed). Note editor checklist lines use whitespace only—no hairlines between checklist lines.
3. Keyboard accessory bar top border (`0..390pt`).
4. Backlinks (`"Bağlantılar"`) top divider in Note Editor (`left: 20pt`, `right: 20pt`).
5. Internal item dividers inside the `•••` popover menu and Command Palette search bar.
- **Never** put hairline borders around icon buttons, filter chips, or standard list rows. Never use `borderStyle: 'dashed'`.

### 1.4 Corner Radii
`radius = { s: 8, m: 12, l: 16, pill: 999 }` (`radius.l` tightened from `18` → `16pt`; `radius.xl: 26` retired).
- `8pt` (`s`): Keyboard accessory buttons, inline code/tag highlights.
- `12pt` (`m`): `"▶ Sıradaki: …"` bar, Pinned cards, `•••` menu, Toast.
- `16pt` (`l`): Command Palette, Graph node preview card, Autopilot inline split card.
- `999pt` (`pill`): Home FAB `＋`, Autopilot `"✓ Tamamlandı"` button, top bar text pills, Graph filter chips.

### 1.5 When (Rarely) to Use a Card
Default layout is flat text and rows directly on `c.bg`. **No boxes inside boxes.** Elevated/filled cards are restricted to **4 cases**:
1. **Home `"▶ Sıradaki: …"` pill** (`c.surface`, single line, `40pt` height).
2. **Home `"Sabitlenenler"` tiles** (`c.surface`, `160 × 68pt`, read-only preview—never nest interactive checkboxes inside cards).
3. **Floating overlays**: Command Palette, `•••` menu, Graph node preview, Toast (`c.card` or `c.invBg` with `0.33pt` `c.cardBorder` and `0 8pt 24pt` `c.shadow`).
4. **"Dış Göz" prompt footer** (subtle `c.surface` / `c.obsPaper` container at the bottom of the reading page).

---

## 2. Motion Specification

### 2.1 Global Timing & Easing
- **Single primitive:** `withTiming(toValue, { duration, easing: Easing.out(Easing.cubic) })` where `duration` is strictly **`150ms–220ms`**.
- **Banned:** `withSpring`, all `spring.*` tokens in `tokens.ts`, `FadeInDown.springify()`, `scale` transforms on press (`scaleTo` prop removed), press-and-hold progress rings, and continuous `withRepeat` breathing loops.
- **Tap feedback:** Instant opacity change (`1 → 0.6` on `onPressIn`, `150ms` `Easing.out(cubic)` back to `1` on `onPressOut`) or row background highlight (`c.surface`).

### 2.2 Element Choreography Matrix

| Element / Interaction | Animation Type | Spec |
| :--- | :--- | :--- |
| Sticky top bar bottom hairline | **Fade** | `opacity: 0 ↔ 1`, `150ms` `Easing.out(cubic)` at `scrollY > 4pt` |
| "Dış Göz" & Autopilot screen transition | **Fade** | `opacity: 0 → 1`, `180ms` `Easing.out(cubic)` |
| `•••` menu & `[[` link suggestion popover | **Fade** | `opacity: 0 ↔ 1`, `150ms` `Easing.out(cubic)` (no scale/translate) |
| Checkbox completion & row text dimming | **Fade** | Fill & checkmark `opacity: 0 → 1` in `150ms`; text color fades to `c.textFaint` |
| Command Palette sheet | **Slide + Fade** | `translateY: -8 → 0pt`, `opacity: 0 → 1`, `180ms` `Easing.out(cubic)` |
| Toast with Undo | **Slide + Fade** | `translateY: 16 → 0pt`, `opacity: 0 → 1`, `200ms` enter / `160ms` exit |
| Graph selected node bottom card | **Slide + Fade** | `translateY: 16 → 0pt`, `opacity: 0 → 1`, `180ms` `Easing.out(cubic)` |
| Row insert / delete / indent layout shift | **Slide + Fade** | Height & `translateX` `180ms` `Easing.out(cubic)` |
| Row swipe actions (`Sil` / `Alt görev yap`) | **Slide** | 1:1 pan tracking; release snaps in `180ms` `Easing.out(cubic)` |
| List mount, theme switch, button taps, filter chips, editor focus | **None (0ms)** | Render immediately at final position; zero mount stagger delays |

---

## 3. Per-Screen Layout Spec (iPhone 12: `390 × 844 pt`, Safe Area Top `47pt`, Bottom `34pt`)

### 3.1 Home (`HomeScreen`)
- **Sticky Blurred Top Bar (`y: 0..99pt`, height `99pt` = `47pt` inset + `52pt` bar):**
  - Background: `BlurView` (`intensity: 75`) over `c.bg` (`85%` alpha). Bottom `0.33pt` `c.hairline` visible when scrolled.
  - **Left (`x: 20pt`, centered in `52pt` bar):** Greeting in `type.title` (`20pt` SemiBold, `c.text`): `"Günaydın"`, `"İyi günler"`, `"İyi akşamlar"`, or `"İyi geceler"`. No date eyebrow above it; no trailing period.
  - **Right (`x: 254..370pt`, `gap: 4pt`):** 3 borderless icon buttons (`36 × 36pt` hit box, `19pt` icon, `1.75pt` stroke in `c.textDim`, no circle border/fill):
    1. **Search** (`search`, `"Ara"`) → opens Command Palette.
    2. **Graph** (`graph`, `"Graf"`) → opens Graph screen.
    3. **Theme** (`sun` / `moon`, `"Tema"`) → toggles Light/Dark immediately (long-press opens Settings/Backup).
- **Single-Line Next Action Pill (`y: 107pt`, `x: 20..370pt`, `350 × 40pt`):**
  - `borderRadius: 12pt`, `backgroundColor: c.surface`, `paddingHorizontal: 14pt`, `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 8pt`.
  - Copy: `▶` (`11pt`, `c.amberInk`) + `"Sıradaki: "` (`13pt` Medium, `c.textDim`) + `{nextTask.title}` (`13pt` Medium, `c.text`, `numberOfLines={1}`, `flex: 1`) + `›` (`14pt`, `c.textFaint`).
  - Tap opens Autopilot. If queue is empty, hide pill (`0pt`) and shift list up to `y: 107pt`.
- **Optional `"Sabitlenenler"` Section (`y: 167pt` when `pinned.length > 0`):**
  - Header at `x: 20pt`: `"Sabitlenenler"` (`type.section`, `13pt` SemiBold, `c.textDim`).
  - Horizontal `ScrollView` at `y: 193..261pt` (`height: 68pt`, `paddingHorizontal: 20pt`, `gap: 10pt`).
  - Each tile: `160 × 68pt`, `borderRadius: 12pt`, `backgroundColor: c.surface`, `padding: 12pt`. Shows title (`14pt` Medium, `c.text`, max 2 lines) and top-right `12pt` progress ring if it has subtasks.
- **Main List (`y: 281pt` or `163pt` without Pinned, `x: 0..390pt`):**
  - If `"Gelen Kutusu"` has items, render it as the first row (`48pt` height, `inbox` icon `18pt` in `c.accent`, title `"Gelen Kutusu"`, right count in `13pt` `c.textDim`).
  - Followed by root rows (Section 4 anatomy). Bottom scroll padding: `104pt`. Remove the dashed `"Yeni evren"` button and gesture tutorial footer.
- **Bottom-Right FAB `＋` (`x: 318..370pt`, `y: 742..794pt`):**
  - `right: 20pt`, `bottom: 50pt` (`34pt` inset + `16pt`). Size: `52 × 52pt`, `borderRadius: 999pt`, `backgroundColor: c.accent`, shadow `0 4pt 12pt c.shadow`.
  - Centered `＋` icon (`22pt`, `#FFFFFF`, stroke `2pt`). Tap creates a note and opens Note Editor with title focused.

### 3.2 Note Editor (`NodeScreen`)
- **Sticky Top Bar (`y: 0..91pt`, height `91pt` = `47pt` inset + `44pt` bar):**
  - Blurred `c.bg`, bottom `0.33pt` `c.hairline` on scroll.
  - **Left (`x: 12pt`):** `‹ Geri` button (`height: 44pt`, `paddingHorizontal: 8pt`, `gap: 4pt`). Chevron `‹` (`18pt`, `c.textDim`) + `"Geri"` (`16pt` Regular, `c.textDim`).
  - **Right (`x: 378pt` right-aligned, `gap: 6pt`):**
    1. `"Otopilot"` pill (`height: 28pt`, `paddingHorizontal: 10pt`, `borderRadius: 999pt`, `backgroundColor: c.surface`, `13pt` Medium `c.text`; hidden when node has 0 open tasks).
    2. `"Dış Göz"` pill (`height: 28pt`, `paddingHorizontal: 10pt`, `borderRadius: 999pt`, `backgroundColor: c.surface`, `13pt` Medium `c.text`).
    3. `"Sil"` icon button (`32 × 32pt`, `trash` icon `17pt` in `c.textDim`, `accessibilityLabel="Sil"`).
    4. `"•••"` icon button (`32 × 32pt`, horizontal 3-dots `17pt` in `c.textDim`, `accessibilityLabel="Diğer seçenekler"`).
- **Title (`y: 107pt`, `x: 20..370pt`):**
  - `TextInput` in `type.display` (`26pt` SemiBold, `lineHeight: 32pt`, `c.text`), placeholder `"Başlık"` (`c.textFaint`). No checkbox or progress ring next to the title.
- **Body (`12pt` below Title, `x: 20..370pt`):**
  - `type.body` (`16pt` Regular, `lineHeight: 24pt`, `c.text`), placeholder `"Not ekle…"` (`c.textFaint`). `[[Bağlantı]]` renders in `c.link`, `#etiket` in `c.tag` (plain colored text, no pill backgrounds).
- **Checklist / Sub-items (`16pt` below Body, `x: 0..390pt`):**
  - Each line (`minHeight: 44pt`, `paddingHorizontal: 20pt`, indent `+20pt` per level) has a left `18 × 18pt` circle in a `30pt` gutter (`18pt` circle + `12pt` gap):
    - **Plain line (`isTask: false`):** Faint circle (`18 × 18pt`, `1pt` stroke in `c.hairline`). Tapping this faint circle turns the line into a task (`isTask: true`).
    - **Task line (`isTask: true`):** Standard task checkbox (`18 × 18pt`, `1.5pt` stroke in `c.textDim`; filled `c.amber` when done). Tapping toggles completion.
  - Trailing input row at bottom: faint circle + `"Yeni satır…"` placeholder (`16pt`, `c.textFaint`).
- **Keyboard Accessory Bar (docked above keyboard, `width: 390pt`, `height: 44pt`):**
  - `backgroundColor: c.surface`, top border `0.33pt` `c.hairline`, `paddingHorizontal: 10pt`, `flexDirection: 'row'`, `alignItems: 'center'`.
  - Left actions (`gap: 4pt`, each `height: 32pt`, `paddingHorizontal: 8pt`, `borderRadius: 8pt`, `13pt` Medium `c.text`):
    - `☑ Görev` (toggles task state; active fill `c.accentSoft`, text `c.accent`)
    - `↳ Altına al` (indents line)
    - `↰ Üste çıkar` (outdents line)
    - `& Bağla` (inserts `[[` and opens link autocomplete popover)
  - Right action (`marginLeft: 'auto'`): `Bitti ⌄` (`height: 32pt`, `paddingHorizontal: 10pt`, `13pt` SemiBold `c.accent`, dismisses keyboard).

### 3.3 Reading View — "Dış Göz" (`ObserverScreen`)
- **Surface:** Flat `c.obsPaper` across the entire screen (no Skia noise grain, no gradient).
- **Top Bar (`y: 47..91pt`, `paddingHorizontal: 20pt`):** Left button `"‹ Nota dön"` (`15pt` Regular, `c.obsInkDim`). Right side empty.
- **Book Page (`paddingHorizontal: 28pt`, column width `334pt`, `paddingTop: 16pt`, `paddingBottom: 60pt`):**
  - **Title:** `type.serifTitle` (`28pt` `Newsreader_500Medium`, `lineHeight: 34pt`, `c.obsInk`).
  - **Body (`20pt` below title):** Exact note body (never rewritten into 3rd-person `"Özne"`) rendered in `type.serifBody` (`19pt` `Newsreader_400Regular`, `lineHeight: 30pt`, `c.obsInk`).
  - **Rule (`32pt` below body):** `width: 48pt`, `height: 1pt`, `backgroundColor: c.obsRule`.
  - **Single Prompt Block (`24pt` below rule):**
    - Prompt copy: `"Şu an atılabilecek en küçük, somut adım ne?"` (`17pt` `Newsreader_400Regular_Italic`, `lineHeight: 25pt`, `c.obsInkDim`).
    - Existing tasks under this note render `12pt` below as clean checklist lines (`16pt` `Inter_400Regular`, `c.obsInk`).
    - Action trigger (`12pt` below): `"＋ Eylem adımı ekle"` (`height: 40pt`, `14pt` `Inter_500Medium`, `c.accent` / `c.obsInk`). Tapping focuses an inline `TextInput` (`16pt` `Inter_400Regular`, bottom hairline `c.obsRule`, placeholder `"Adımı yaz ve Enter’a bas…"`), which appends a task to the note immediately on submit.

### 3.4 Autopilot (`AutopilotScreen`)
- **Surface:** Flat `c.bg` (no `tunnelBg`, no breathing radial glow).
- **Top Bar (`y: 47..91pt`, `paddingHorizontal: 20pt`):**
  - Left: `✕` close button (`36 × 36pt`, `18pt` icon in `c.textDim`, `"Kapat"`).
  - Right: Step counter `"{current} / {total}"` (`12pt` `type.mono`, `c.textFaint`). No elapsed timer.
- **Task Stage (`y: 160..560pt`, `paddingHorizontal: 28pt`, `width: 334pt`, centered vertically):**
  - Parent note breadcrumb: `13pt` `Inter_500Medium`, `c.textDim`, sentence case, 1 line, `marginBottom: 10pt`.
  - Task title: `type.display` (`26pt` `Inter_600SemiBold`, `lineHeight: 33pt`, `c.text`).
  - Optional body preview: `15pt` `Inter_400Regular`, `lineHeight: 22pt`, `c.textDim`, `marginTop: 12pt`, max 3 lines.
- **Bottom Actions (`y: 668..786pt`, `paddingHorizontal: 28pt`):**
  - **Big Primary Button (`334 × 54pt`):** `borderRadius: 999pt`, `backgroundColor: c.amber`, centered label `"✓ Tamamlandı"` (`16pt` `Inter_600SemiBold`, `c.onAmber`). Completes on a **single tap** (no long-press ring).
  - **Small Secondary Actions (`14pt` below, `height: 36pt`, centered row, `gap: 28pt`):**
    - `"İkiye böl"` (`14pt` `Inter_500Medium`, `c.textDim`) → reveals two inline `TextInput` rows (`"İlk adım"`, `"Sonraki adım"`) + `"Böl"` button.
    - `"Atla"` (`14pt` `Inter_500Medium`, `c.textDim`) → advances to next task.

### 3.5 Graph Chrome, Command Palette, `•••` Menu & Toast
- **Graph Chrome (`GraphScreen`):**
  - Top bar (`y: 47..91pt`, `paddingHorizontal: 16pt`): Left `‹ Geri` pill (`height: 34pt`, `paddingHorizontal: 12pt`, `c.surface`). Right segmented pill (`height: 32pt`, `padding: 2pt`, `c.surface`): `"Tümü"` | `"Odak"` (`13pt` Medium, active segment `c.card`).
  - Filter chips (`y: 99pt`, `paddingHorizontal: 16pt`, `gap: 6pt`): `"Görevler"`, `"Notlar"`, `"Etiketler"`, `"Tamamlanan"` (`height: 28pt`, `paddingHorizontal: 10pt`, `borderRadius: 999pt`, active `c.accentSoft`/`c.accent`, inactive `c.surface`/`c.textDim`, `0pt` border).
  - Bottom area: **Completely empty** when no node is selected (delete the 3-dot legend and `"FİZİK UYKUDA · 0% CPU"`). When a node is selected, show a card at `bottom: 50pt`, `x: 16..374pt` (`358pt` wide, `padding: 16pt`, `borderRadius: 16pt`, `c.card`, `0.33pt` `c.cardBorder`) with title + 2 buttons (`height: 34pt`): `"Notu aç"` (`c.accent`) and `"Merkeze al"` (`c.surface`).
- **Command Palette:**
  - Card at `y: 63pt`, `x: 16..374pt` (`width: 358pt`, `maxHeight: 400pt`, `borderRadius: 16pt`, `c.card`, `0.33pt` `c.cardBorder`) over `c.scrim`.
  - Input row (`height: 48pt`, `paddingHorizontal: 14pt`, bottom hairline `c.hairline`): `16pt` `search` icon + `"Notlarda ara veya komut yaz…"`.
  - Result rows: `height: 44pt`, `paddingHorizontal: 14pt`, title (`15pt` Regular `c.text`) + right parent name (`13pt` `c.textFaint`).
- **`•••` Menu (Note Editor):**
  - Popover at `top: 95pt`, `right: 16pt`, `width: 216pt`, `borderRadius: 12pt`, `c.card`, `0.33pt` `c.cardBorder`, shadow `0 8pt 24pt c.shadow`.
  - 4 rows (`height: 42pt`, `paddingHorizontal: 14pt`, `0.33pt` `c.hairline` dividers, `15pt` Regular `c.text`):
    1. `"Sabitle"` / `"Sabitlemeyi kaldır"` (`pin`)
    2. `"Hatırlatıcı ekle"` (`bell`)
    3. `"Taşı…"` (`move`)
    4. `"Listeyi kilitle"` / `"Kilidi aç"` (`lock`)
- **Toast with Undo:**
  - Floating bar at `bottom: 50pt`, `x: 20..370pt` (`350 × 44pt`), `borderRadius: 12pt`, `backgroundColor: c.invBg`, `paddingHorizontal: 14pt`.
  - Left: status message (`13pt` Regular, `c.invText`, e.g., `"Silindi"`). Right: `"Geri al"` button (`13pt` SemiBold, `c.invAccent`). Auto-hides in `3500ms`.

---

## 4. Row Anatomy (`OutlineList` & Checklist Rows)

```
|<-- 20pt -->|<-- 18pt -->|<-- 12pt -->|<------- 308pt / 286pt ------->|<-- 8pt -->|<-- 14pt -->|<-- 20pt -->|
              [ ○ 18×18 ]               Başlık metni (16/22pt Inter)                 ( ◔ 14×14 )
                                        Tek satır önizleme (13/18pt)
                                        ─────────────────────────────── (0.33pt hairline: x=50..370pt)
```

1. **Dimensions & Indentation:**
   - Base horizontal padding: `left: 20pt`, `right: 20pt`. Each nesting level adds `+20pt` to `paddingLeft` (capped at depth 2 = `60pt`).
   - Vertical padding: `11pt` top and bottom (`44pt` min-height for single-line checklist row; `48pt` on Home; `64pt` when 1-line preview is present).
2. **Checkbox Size & Stroke:**
   - Visual circle: **`18 × 18pt`** (`borderRadius: 9pt`), touch target `36 × 36pt`.
   - **Task (`isTask: true`, `done: false`):** `1.5pt` solid stroke in `c.textDim`, transparent fill.
   - **Plain line in Note Editor (`isTask: false`):** `1.0pt` solid stroke in `c.hairline` (faint circle; tapping converts line to a task). On Home, pure notes with no subtasks omit the circle or show a faint circle in `c.hairline`.
   - **Completed (`done: true`):** Solid `c.amber` fill, `0pt` border, centered `10pt` checkmark (`1.8pt` stroke in `c.onAmber`).
3. **Text Baseline Alignment:**
   - Row container uses `flexDirection: 'row'`, `alignItems: 'flex-start'`.
   - First-line title text has `fontSize: 16pt`, `lineHeight: 22pt`.
   - The `18 × 18pt` checkbox has **`marginTop: 2pt`** (`(22 - 18) / 2`) so its center sits optically on the first line's cap-height center even when the title wraps to 2 lines.
   - Gap between checkbox and text column: **`12pt`** (text starts at `x = 50pt` at depth 0).
   - Completed task title: `color: c.textFaint`, `textDecorationLine: 'line-through'`.
4. **Preview Line Rules:**
   - Rendered **only** on Home rows when `node.body` is non-empty.
   - Strictly **1 line** (`numberOfLines={1}`, `ellipsizeMode="tail"`), `13pt` `Inter_400Regular`, `lineHeight: 18pt`, `color: c.textDim`, `marginTop: 2pt`, aligned with title at `x: 50pt`. Strip `[[` / `]]` syntax via `plainPreview`.
5. **Separators:**
   - On Home: `0.33pt` (`StyleSheet.hairlineWidth`) in `c.hairline`, **inset from `left: 50pt` to `right: 20pt`**.
   - In Note Editor checklist: **no separators** between checklist lines.
6. **Progress Indicator (Tiny Ring Only):**
   - Right-aligned at `x: 356..370pt`, `marginTop: 4pt`.
   - **`14 × 14pt`** SVG circle (`strokeWidth: 1.75pt`), track `c.ring`, progress arc `c.amber`.
   - **Never** display fraction text (`2/5`), percentages (`40%`), or subtask counts next to the ring.
7. **Swipe Actions (`72pt` activation threshold):**
   - **Swipe Left (reveals right action):** Red `"Sil"` (`backgroundColor: c.danger`, `trash` icon `16pt` + `"Sil"` `13pt` SemiBold `#FFFFFF`). Triggers deletion + Undo Toast.
   - **Swipe Right (reveals left action):** `"Alt görev yap"` (`backgroundColor: c.accentSoft`, `↳` icon `16pt` + `"Alt görev yap"` `13pt` SemiBold `c.accent`). Indents row under previous sibling.

---

## 5. Banned List & Light/Dark Colour Usage Table

### 5.1 Banned Words, Labels & Patterns

| Banned Word / Copy | Replacement in UI | Rationale |
| :--- | :--- | :--- |
| `"Işınla"` | **`"Taşı…"`** | Sci-fi jargon obscures a standard move action. |
| `"Mühür"` / `"Mühürlü plan"` | **`"Listeyi kilitle"` / `"Kilitli"`** | Self-explanatory without melodrama. |
| `"Vitrin"` / `"Vitrinden kaldırıldı"` | **`"Sabitlenenler"` / `"Sabitle"`** | Matches native iOS Notes mental model. |
| `"Evren"` / `"Yeni evren"` | **`"Not"` / `"Yeni not"`** | Removes pretentious hierarchy labels. |
| `"Sinaps"` / `"Sinapslar"` / `"SİNAPS KUR"` | **`"Bağlantılar"` / `"Bağla"`** | Clear backlink terminology. |
| `"Düğüm"` / `"Atomik adım"` | **`"Not"` / `"Görev"`** | Speak like a human, not a graph database. |
| `"Tünel boş"` / `"Işığa dön"` / `"Beynini kapat…"` | **`"Tüm görevler tamamlandı."` / `"Geri dön"`** | Calm closure instead of theatrical coaching. |
| `"VAKA №"`, `"GÖZLEM KAYDI"`, `"ÖZNENİN BEYANI"`, `"Sis endeksi"`, `"Reçete"`, `"Demleniyor"` | **Deleted** (use single prompt: `"Şu an atılabilecek en küçük, somut adım ne?"`) | Eliminates fake detective-dossier roleplay and timer locks. |

**Banned Visual Patterns:**
- Uppercase tracked-out metadata headers (`GÖREV · 2/5 ALT GÖREV · 1. KATMAN`, `SOFIA CORTEX`, `FİZİK UYKUDA · 0% CPU`).
- Boxes inside boxes (nested `Surface` components, interactive checkboxes inside horizontal Pinned cards, bordered section cards on Home).
- The 8-icon horizontal toolbar in Note Editor.
- Multi-line Home Focus Card (`FocusCard` replaced by the `40pt` single-line `"▶ Sıradaki: …"` pill).
- Press-and-hold `650ms` ring in Autopilot, Skia `FractalNoise` paper shader, and Skia breathing `RadialGradient`.

### 5.2 Light & Dark Colour Usage Table (`src/theme/tokens.ts`)
Proposed adjustments warm up Dark mode from cold blue-black to calm obsidian and unify the Reading View surface:

| Token | Light Hex | Dark Hex (Adjusted) | Exact UI Role |
| :--- | :--- | :--- | :--- |
| `bg` | `#FBF9F5` | `#0C0C0E` *(was `#090A0C`)* | Primary screen background (Home, Editor, Autopilot, Settings) |
| `surface` | `#F3EFEA` | `#16161A` *(was `#111318`)* | `"▶ Sıradaki: …"` pill, `"Sabitlenenler"` tiles, keyboard bar, top bar pills |
| `card` | `#FFFFFF` | `#1C1C21` *(was `#181B22`)* | Floating overlays only: Command Palette, `•••` menu, Graph node card |
| `cardBorder` | `#E6E1DA` | `rgba(255,255,255,0.07)` | `0.33pt` border on floating overlays (`card`) only |
| `hairline` | `#E9E4DD` | `rgba(255,255,255,0.07)` | Inset row separators (`x: 50..370pt`), sticky bar bottom rule, faint task circle |
| `text` | `#18181B` | `#F4F4F6` | Primary titles, body prose, active row titles |
| `textDim` | `#71717A` | `#8E929F` | Top bar icons, section titles, 1-line row previews, unchecked `1.5pt` task circle |
| `textFaint` | `#8C857E` | `#636672` *(was `#6E7280`)* | Placeholders, completed task strikethrough text, Autopilot step counter |
| `accent` | `#4F46E5` | `#8B85FF` | Home FAB `＋`, `"Bitti ⌄"`, active filter chip text, right-swipe `"Alt görev yap"` |
| `accentSoft` | `rgba(79,70,229,0.09)` | `rgba(139,133,255,0.12)` | Active filter chip fill, right-swipe action background, active `☑ Görev` chip |
| `amber` | `#D97706` | `#F2A33A` | Completed checkbox fill, `14pt` progress ring arc, Autopilot `"✓ Tamamlandı"` fill |
| `amberInk` | `#B45309` | `#F2A33A` | `"▶"` icon in Home `"Sıradaki"` pill |
| `onAmber` | `#FFFFFF` *(was `#1C1917`)* | `#0C0C0E` | Checkmark stroke inside completed checkbox, `"✓ Tamamlandı"` button label |
| `danger` | `#B4443A` | `#E5796E` | Left-swipe `"Sil"` action fill and destructive confirmation text |
| `link` / `tag` | `#4338CA` / `#9A5B13` | `#A5A0FF` / `#E8B36A` | Inline `[[bağlantı]]` and `#etiket` text color (no background pill) |
| `ring` | `#E7E1D8` | `rgba(255,255,255,0.09)` | Unfilled track of the `14 × 14pt` row progress ring |
| `invBg` / `invText` | `#1A1A1D` / `#F7F5F0` | `#242429` / `#F4F4F6` | Toast background and Toast message text |
| `invAccent` | `#F2C27A` | `#F2A33A` | Toast `"Geri al"` action button text |
| `obsPaper` | `#F7F2E8` | `#101012` *(was `#0E0E10`)* | Flat background for "Dış Göz" reading view (`obsBg` merged into `obsPaper`) |
| `obsInk` / `obsInkDim` | `#1C1A17` / `#6E655A` | `#ECE6DA` / `#8F877A` | "Dış Göz" serif prose and italic reflection prompt |
| `obsRule` | `#CFC4B2` | `rgba(236,230,218,0.14)` | "Dış Göz" `48pt` divider rule and action input bottom hairline |
| `graphBg` / `graphNode` / `graphEdge` | `#FBF9F5` / `#3F3F46` / `rgba(63,63,70,0.16)` | `#0C0C0E` / `#C9CBD3` / `rgba(201,203,211,0.11)` | Graph canvas matches `bg`; subtle node and edge strokes |

*(Retire unused tokens: `bgSunk`, `highlight`, `amberSoft`, `obsBg`, `obsStamp`, `tunnelBg`, `tunnelGlow`.)*
