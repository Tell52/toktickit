# Lab 2 UI Specification: Zen Green Theme

## 1. Color Tokens
*   **Primary green:** `#006B3C` for app header, primary actions, and strong emphasis[cite: 8].
*   **Secondary green:** `#0B7A46` for active tabs, focus accents, links, and hover states[cite: 8].
*   **Pale green:** `#EAF6EF` for selected, success, and subtle section emphasis[cite: 8].
*   **Page background:** `#F5F7F6` or similarly quiet near-white[cite: 8].
*   **Surface/cards:** White with subtle border and restrained shadow[cite: 8].
*   **Text:** Dark charcoal-green, not pure black, for comfortable reading[cite: 8].
*   **Error:** Dark red text and border[cite: 8].
*   **Warning:** Amber callout or badge; do not use warning color as ordinary decoration[cite: 8].
*   **Success:** Green confirmation with readable text and no reliance on color alone[cite: 8].

## 2. Component States & Typography
*   **Typography:** Labels appear above controls and use consistent font weight and spacing[cite: 8].
*   **Editable field:** White background with clear neutral border[cite: 8].
*   **Read-only field:** Soft gray-green or warm ivory shading that is clearly distinct but still readable[cite: 8].
*   **Disabled controls:** Must be visually distinct and cannot be activated[cite: 8].
*   **Busy Button:** The Submit button shows a busy state and is disabled while the request is being processed[cite: 8].
*   **Accessibility:** Focus indicators must remain visible for keyboard users[cite: 8]. Buttons include visible text; every icon-only control requires an accessible label and tooltip[cite: 8].

## 3. Validation Placement
*   **Required Fields:** Required fields show a red asterisk[cite: 8]. The asterisk does not replace the validation message[cite: 8].
*   **Error Messages:** Validation messages appear near the associated field, not as one mysterious error at the top only[cite: 8]. Error messages appear immediately below the field[cite: 8].

## 4. Responsive Behavior Rules
*   **Desktop (≥ 992 px):** Multi-column layout as specified; content centered with a sensible maximum width[cite: 8].
*   **Tablet (768-991 px):** Two-column layout where practical; Summary and Description receive enough width[cite: 8].
*   **Mobile (< 768 px):** Fields stack vertically; buttons remain touch-friendly; no horizontal page scrolling[cite: 8].
*   **All Sizes:** No clipped labels, overlapping messages, hidden buttons, or unreadable attachment names[cite: 8].

## 5. Visual Inspection Checklist
*   [ ] Check automated assertions for required CSS classes, field states, labels, asterisks, messages, and button behavior[cite: 8].
*   [ ] Capture Playwright screenshots at desktop, tablet, and mobile viewport sizes[cite: 8].
*   [ ] Confirm no clipping, overlap, unintended horizontal scrolling, inconsistent field styling, or missing states[cite: 8].
*   [ ] Compare against ui-spec.md and the approved illustrations for Create Ticket, My Tickets, and Ticket Detail[cite: 8].
*   [ ] Verify desktop table and mobile ticket-card or responsive-table behavior[cite: 8].
*   [ ] Verify badge consistency for Requested Priority, IT Priority, and Current Status[cite: 8].
*   [ ] Confirm filters, pagination, attachment controls, and empty states remain usable at all viewport sizes[cite: 8].