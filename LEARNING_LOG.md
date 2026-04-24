# Learning Log

## Day 1 - 37 minutes

### What I worked on
- Read and analyzed the full exercise brief
- Read the Agentic Vision announcement to understand what Tier 2 actually requires
- Compared Next.js fullstack vs separate FastAPI backend
- Planned about the work timeline - roughly 3–4 hrs/day across the week to hit the 15–20 hr estimate

### Decisions
- Chose Next.js fullstack to reduce deployment complexity and avoid CORS issues

### Constraints
- Currently employed full-time, so hours are split across mornings and evenings
  rather than in one block

## Day 2 (2 hrs and 40 minutes)

### What I worked on
- Setup Next.js project with tailwind for styling
- Created github repo and made the first commit
- Built the upload page with image picker, question input, submit button, loading and error state
- Built the API route that receives the image and question, converts the image
  to base64, and sends both to Gemini
- Got an API key from Google AI Studio and stored it in .env.local
- Created env file to store securely my api key
- 

### Decisions:
- Used FormData instead of JSON for the request because the image is binary —
  you can't cleanly put raw bytes in a JSON string without encoding it first,
  and that's the server's job not the browser's
- Image is sent as base64 inline_data to Gemini, keeps the app stateless,
  no file storage needed
- API key only lives in route.ts via process.env, never referenced in any
  client file, never prefixed with NEXT_PUBLIC_

### Constraints
- Hit a bug where the image wasn't reaching the server, turned out I was
  setting Content-Type to application/json manually while sending FormData,
  which broke the multipart boundary. Removing that header fixed it.

### What I used AI for:
- Asked Claude to compare Next.js-only vs Next.js + FastAPI per tier before
  committing to a stack
- Used Claude to generate the initial skeleton for route.ts and page.tsx
- Described the FormData + Content-Type bug to Claude and got the diagnosis
- Asked Claude what 0x00000000 meant in the curl response
- Asked Claude to explain the Gemini request shape, why parts, why inline_data,
  why the array structure.

### How I validated:
- Ran curl against the Gemini API manually before writing any TypeScript so I
  knew what the request and response actually looked like
- After the FormData bug, traced through the fix line by line before accepting
  it, understood why it worked.


## Day 3
**Hours:** 2 h 28m

### What I worked on
Added image compression using sharp before sending to Gemini,
improved the AI instruction prompt, and cleaned up error handling
with try/catch.

### What I got stuck on
I added sharp compression expecting it to reduce Gemini token usage.
Checked the logs and both before and after showed identical image
tokens, 1,089. Spent time reading the Gemini media resolution docs
and learned that the default resolution is "high" which uses up to 1,120 tokens
per image. So compression doesn't reduce token count — the real
benefit is transfer latency and payload size.

Also hit a 503 from Gemini mid-testing — "high demand, try again later".
Not a code problem, just preview model capacity limits during peak hours.
Waited and retried.

### What I used Claude for
- Suggested using sharp for server-side compression
- Explained the resize fit options (inside vs cover vs contain)
- Helped me understand why 85% JPEG quality is the standard sweet spot

### How I validated it
Logged original and compressed size on every request, 
Then compared the Gemini response logs before and after compression
to check actual token usage.

### Decisions and trade-offs
- Always convert to JPEG at 85%
- Kept mediaResolution at default (high, 1089 tokens) for now.
  Could drop to medium (560 tokens) to cut token cost but would
  hurt accuracy for serial number reading and fine detail tasks.
- Trimmed the AI instruction to a direct command.

## Day 4
**Hours:** 1h 55 m

### What I worked on
- Added tools: [{ codeExecution: {} }] to the payload and built a parser that maps the mixed parts[] array into a typed steps[] timeline (thought, code, result, image, answer)

### What I got stuck on 
- The response didn't show any code execution, only a direct text answer, tried improving prompt but still didn't work. 
- Had to study the Gemini code execution response shape to understand where the expected output should come from.

### How I got unstuck
- I realized I had switched the model to gemini-2.5-flash to save tokens during testing. After reverting to gemini-3-flash-preview, it started working
- Then inspected the logged response data to verify the structure.

### I used Claude AI to:
- Understand the full response shape before writing the parser (executableCode, codeExecutionResult, inlineData, outcome)
- Explaining what tools: [{codeExecution: {}}] actually does and why {} is intentional
- What response I should return to the client
- How to shape it
- Regenerate the UI for Think - Act - Obeserve steps

### I validated the AI answers by:
- Logged the raw API response, and compared actual field names against what the parser expected
- check what step_meta does 
- checked that the image type correctly prepends data:${mimetype};base64 since the backend returns raw base64 without the URI prefix
- Verified the form still sends FormData the same way as before — image and question fields unchanged
- Confirmed data.steps is what the updated page reads, matching what the backend now returns instead of data.answer

### Decisions made and trade-offs accepted
- Kept sharp compression, it still sufficient for cropping and annotation tasks.

### Do differently with more time
- Would add outcome handling on codeExecutionResult, so failed execution shows as an error step in the UI instead of an empty result block

## Day 5
**Hours:** 1h 56m

### What I worked on
- Read docs on whether agentic vision exposes readable thinking steps before code execution
- Fixed text part classification, it was incorrectly using `thoughtSignature` to detect thoughts, rewrote to classify by position relative to `executableCode` parts instead
- Investigated how to handle answer parts that return as JSON or structured text instead of plain readable text

### What I got stuck on
- I spent time trying to analyze a readable Think step. Tried to config thinkingConfig: { thinkingLevel: "high" } but still no readable thought text appeared.
- Some answer parts came back as JSON or structured text which rendered as a raw blob in the UI.

### How I got unstuck
- Asked AI how to render a think step when there is no text before `executableCode`. Learned that `thoughtSignature` is an opaque blob that runs internally inside Google's infrastructure — it is not exposed as readable text through the API.

### I used Claude/ChatGPT AI to:
- Understand what `thoughtSignature` actually is and why it is not human-readable

### I validated the AI answers by:
- Tested `thinkingConfig` payload myself and confirmed no readable thought parts appeared in the response

### Decisions made and trade-offs accepted
- Switched text classification to use position, text after `executableCode` is the final answer. 
- Accepted that the Think process cannot be rendered.

### Do differently with more time
- Would investigate further if there is any supported way to expose the thinking process.


