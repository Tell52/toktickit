# Lab 2 — AI Use and Reflection  (fill this in)

**LLM/agent used:** Antigravity / Gemini 3.1 Pro

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Create a development plan for Lab 2 Issue 1 (React Frontend setup for TokTickIT). | Used the suggested step-by-step plan to structure my component hierarchy and API integration. |
| 2 | Generate CreateTicket.tsx component with form validation for summary, description, and category. | Integrated the code into my project and adjusted the styling to match the green TokTickIT theme. |
| 3 | Create MyTickets.tsx to fetch and display the list of tickets using a responsive table/card layout. | Implemented the component and mapped the API response to the table rows. |
| 4 | How to manage state in App.tsx to switch between Create Ticket, My Tickets, and System Check?| Added activePage state and conditional rendering for the main content area. |
| 5 | Fix Vitest error where MyTickets expects a mocked API response. | Added vi.mocked() to simulate the API return data in MyTickets.test.tsx. |
| 6 | Playwright test timeout on locator.selectOption for Development Requester. | Updated the locator to use a regular expression /Jennifer Anderson/ instead of an exact string match. |
| 7 | Playwright still fails after adding label: 'Jennifer Anderson'. What's wrong? (Attached error log). | Realized the dropdown options included emails. Updated the selection method to match the exact string or use index |
| 8 | Playwright toBeVisible() timeout after clicking Continue on RequesterSelection. | Updated App.tsx header to display the currentRequester.name so Playwright could find it on the screen. |
| 9 | Is my playwright.config.ts correct? (Attached file). | Uncommented and updated baseURL to http://localhost:5173 to match the Vite development server. |
| 10 | Playwright timeout trying to click 'Create Ticket' link. | Changed the navigation menu items in App.tsx from <span> tags to <a> tags so getByRole('link') would work. |
| 11 | Playwright fails at setInputFiles for 'input[type=file]'. (Attached screenshot of UI). | Realized the file input was missing from the UI. Initial advice was to move the test, but I needed the input on the form. |
| 12 | How to add a Ticket Detail view state in App.tsx | Added a detail state and implemented the handleViewTicket function to switch views.|
| 13 | Playwright can't click the ticket summary to open detail. How to fix MyTickets.tsx | Wrapped the ticket summary text in a <span> with an onClick event triggering onViewTicket |
| 14 | TypeScript error: MyTickets.test.tsx missing onViewTicket prop. | Updated the test file to pass a mocked function onViewTicket={vi.fn()} to satisfy TypeScript |
| 15 | Wait, the frontend needs to be able to input a file on the Create Ticket page. How to fix | Added an attachment <input type="file"> and an Upload button to CreateTicket.tsx |
| 16 | Strict mode violation: getByText('E2E Test Ticket') resolved to 2 elements (td and h6) | Appended .first() to the Playwright locators so the test would interact with the first matched element in the responsive layout |
| 17 | Error: expect(locator).toBeVisible() failed on Ticket Detail page. (Attached UI screenshot) | Confirmed the click event in MyTickets.tsx wasn't triggering properly due to missing optional chaining |
| 18 | Cannot invoke an object which is possibly 'undefined' for onViewTicket in MyTickets.tsx | Added optional chaining (onViewTicket?.(ticket.id.toString())) to safely call the prop function |

## Reflection
Two or three sentences: what made your prompts better, and one place you had to
correct or reject what the agent produced.

Ans :
Providing exact error logs and UI screenshots made my prompts significantly more effective, allowing the AI to pinpoint hidden issues like strict mode violations and missing HTML tags. I had to reject the AI's initial suggestion to move the file upload test steps to the Ticket Detail page; instead, I steered it to help me implement the missing file "input" directly on the Create Ticket form to satisfy the original E2E test requirements