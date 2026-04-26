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
**Hours:** 3h 42m

### What I worked on
- Read docs on whether agentic vision exposes readable thinking steps before code execution
- Fixed text part classification, it was incorrectly using `thoughtSignature` to detect thoughts, rewrote to classify by position relative to `executableCode` parts instead
- Investigated how to handle answer parts that return as JSON or structured text instead of plain readable text
- Added renderAnswerContent and JsonReadable to handle answer parts that Gemini returns as raw JSON instead of plain text

### What I got stuck on
- I spent time trying to analyze a readable Think step. Tried to config thinkingConfig: { thinkingLevel: "high" } but still no readable thought text appeared.
- Some answer parts came back as JSON or structured text which rendered as a raw blob in the UI.
- Fetch failed - Local testing was blocked by network — ETIMEDOUT on generativelanguage.googleapis.com. Confirmed via curl.
- Tried exposing local dev via Cloudflare tunnel to test from phone but also didn't work since the server still routes through the blocked network.

### How I got unstuck
- Asked AI how to render a think step when there is no text before `executableCode`. Learned that `thoughtSignature` is an opaque blob that runs internally inside Google's infrastructure — it is not exposed as readable text through the API.
- For JSON answers, used `renderAnswerContent` helper that detects JSON and renders it as readable key/value pairs instead of a raw string.
- Switched network connection

### I used Claude/ChatGPT AI to:
- Understand what `thoughtSignature` actually is and why it is not human-readable
- Write the `renderAnswerContent` and `JsonReadable` components for structured answer rendering
- Asked how to diagnosed network issue

### I validated the AI answers by:
- Tested `thinkingConfig` payload myself and confirmed no readable thought parts appeared in the response
- Traced through the recursion manually, objects and arrays call JsonReadable again, primitives just convert to string

### Decisions made and trade-offs accepted
- Switched text classification to use position, text after `executableCode` is the final answer. 
- Accepted that the Think process cannot be rendered.
- Set `thinkingLevel` to HIGH for more detailed reasoning, trade-off is slower and slightly more expensive responses

### Do differently with more time
- Show on UI the each step rather than on one full response

## Day 6

### What I worked on
- Added request ID structured logging so each request can be traced from the backend logs to the client response.
- Started supporting multi-turn follow-up questions by accepting conversation history from the client.
- Switched image delivery from inline base64 to the Gemini Files API, upload once on file select, reference by URI on every subsequent request.
- Removed the `compressImage` utility entirely after verifying it was only needed to keep inline payloads small.

### What I got stuck on
- Multi-turn support was tricky because the first request needs the image, but follow-up questions should reuse the conversation context instead of asking the user to upload again.
- I got stuck while adding streaming support for the agentic vision timeline. At first, I thought streaming meant the Gemini response itself would arrive step by step, but my current implementation still waits for the full response before parsing and sending each step to the frontend through SSE.
- I also got stuck on how to properly render a conversation that includes both normal chat turns and agentic timeline steps.
- I initially assumed re-sending the image as base64 on every turn was acceptable. After questioning whether that was normal, I looked into it and found the Files API exists specifically for this, upload once, get a URI back, reference it across all turns. I verified this by logging `payloadSizeKB` before each Gemini request. Turn 1 dropped from ~300KB to 0.6KB. Turn 2 was 10.7KB — only the history text growing, not the image.


### How I got unstuck
- For the Files API discovery, I questioned my own assumption rather than accepting the first working implementation. The logs gave me a concrete, measurable way to verify the fix was real and not just theoretical, 0.6KB vs 300KB is not a subtle difference, and seeing it in the terminal made the trade-off tangible rather than abstract.
- For the streaming confusion, I re-read the Gemini docs more carefully and noticed `streamGenerateContent` as a separate endpoint. The key realization was that wrapping `generateContent` in a `ReadableStream` only streams the delivery from my server to the browser, Gemini itself still processes the full request before responding. Switching endpoints fixes the actual bottleneck, not just the transport layer. I have not fully resolved this yet, it is the next thing to fix, but understanding why the current approach falls short is what got me unblocked conceptually.
- For multi-turn rendering, I realized the flat `steps[]` state model would not work once I needed to preserve previous turns. Switching to a `turns[]` array where each turn holds its own question and steps array let the UI accumulate history without resetting on each submission.

### How I used AI tools
- AI suggested the Files API approach and the upload endpoint structure. Before accepting it, I added payload size logging to verify the claim that inline base64 was expensive — I wanted a number, not just a theory.
- Verified that code, result, answer, and generated image parts are parsed into timeline steps.
- Verified that request IDs appear in backend logs and response headers.

### Trade-offs accepted
- I kept the app stateless and did not add a database.
- The follow-up conversation currently depends on client-provided history, so refreshing the page loses context.
- Files API uploads expire after 48 hours. For this exercise that is fine, but a production version would need to handle re-upload or track expiry.
- Removed `compressImage` after switching to the Files API. Originally added to keep 
  inline base64 payloads small, but once the image is uploaded once and referenced by 
  URI, compression serves no purpose since 5MB limit is still enforced client-side.

### What I would improve with more time
- Improve the UI timeline so code, result, and annotated images are easier to review.
- Use `streamGenerateContent` instead of `generateContent` so agentic steps appear as Gemini produces them, not in a burst after the full response completes.
- Add a re-upload fallback if the Files API URI has expired between sessions.