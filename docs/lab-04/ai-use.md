# Lab 4 — AI Use and Reflection

**LLM/agent used:** OpenAI Codex

## Selected key prompts (6–10)

These prompts are short summaries, rewritten for clarity.

| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Split Lab 4 into GitHub issues and suggest which tasks to do first. Start with the specification and test plan. | Used the issues to divide the work into smaller tasks and follow a clear order. |
| 2 | Write the rules for Actions Taken, ticket status changes and dashboard counts. Describe how the screens and APIs should work before coding. | Used the documents as a guide for building and testing each feature. |
| 3 | Set up feature branches to merge into lab4-staging before main. I will handle commits and merges myself. | Fixed the branch setup and kept each feature on its own branch. |
| 4 | Create tests for each requirement, including user permissions, invalid input and features from earlier labs. | Added a test plan and recorded which tests were planned and which had passed. |
| 5 | Build the Actions Taken API and check user roles and input on the server. Make sure repeated requests do not create duplicates or overwrite newer changes. | Added action APIs, edit history and checks for duplicate requests and conflicting updates. |
| 6 | Check why the CI tests fail when they use the same database. Fix the problem and save the test reports. | Ran backend test files one at a time and added reports to CI. |
| 7 | Check that a ticket is ready before resolving it. Ask for confirmation before cancelling or reopening, and keep the form input if saving fails. | Added status checks, confirmation dialogs and recovery for unsaved input. |
| 8 | Create a Requester dashboard that shows only the current user's tickets. Let users click each count to open the matching ticket list. | Added personal ticket counts, links to filtered lists and navigation tests. |
| 9 | Look at the Firefox and WebKit errors in these screenshots. Check whether the tests run before saving finishes or page focus interrupts typing. | Fixed the comment test to wait for saving and adjusted focus so it no longer interrupted typing. |
| 10 | Test the full ticket flow with different user roles and check that dashboard counts update correctly. Check the timezone used in the test data too. | Added tests across roles and fixed the timezone handling in the SQL used to check test data. |

## Reflection

Ans :

Planning the rules first and working on one task at a time made the AI's changes easier to check. Sharing error logs helped it find problems, but I still needed to review the branch setup and test results before merging.
