# Lab 1 — AI Use and Reflection  (fill this in)

**LLM/agent used:** Antigravity

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Help me set up the TokTickIT project foundation and explain the Git workflow for Issue 1 | Used the step-by-step Git commands to initialize lab1-staging and feature branches. |
| 2 | How to implement the API health check of Issue 2, to return a 200 OK | Replaced the 501 stub in app.ts with the correct JSON response and updated the React frontend. |
| 3 | Create the Prisma Category model and a seed script that is idempotent of Issue 3 | Added the Category model to schema.prisma, ran the migration, and used upsert in seed.ts |
| 4 | Write the GET /api/categories endpoint using Prisma and add the Supertest code for Issue 4 | Implemented findmany with order ascending and added the 4 test assertions in categories.test.ts |
| 5 | Update the React api.ts to fetch both health and categories, and handle errors | Implemented fetch calls and throw errors if the response is not ok |
| 6 | Create Vitest UI tests for the App component showing Online success and Offline error states | Used the generated code to mock the API and assert the UI changes |
| 7 | Generate a complete README.md for the Lab 1 project. | Copied & modifiedthe generated Markdown into the root README.md file |

## Reflection
Two or three sentences: what made your prompts better, and one place you had to
correct or reject what the agent produced.

Ans :
The prompts were better by using the clear instruction about what I want the agent to do. In some cases the agent produced wrong code or wrong result and that make me spend more time to debug and fix it. 
